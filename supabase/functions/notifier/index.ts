// Le Fournil — la fonction d'envoi des notifications (Supabase Edge Functions, Deno).
//
// Réveillée toutes les 5 minutes par pg_cron (supabase/fournil-notifs-cron.sql), avec « Authorization: Bearer <CRON_SECRET> » :
//   1. elle refuse tout appel sans le bon CRON_SECRET (401) ; sans secret configuré, elle refuse tout (500) ;
//   2. elle lit la file : fournil_notifs_dues (fonction SQL réservée au rôle de service), au plus 100 notifications ;
//   3. elle envoie chacune à chaque appareil de son joueur (Web Push, chiffré, signé VAPID), le contenu étant le JSON
//      { titre, texte, url, type } que lit fournil/sw.js ;
//   4. elle accuse : fournil_notifs_faites (les notifications traitées, et les appareils disparus : 404 et 410, retirés).
//
// Les secrets (Edge Functions → Secrets, jamais dans le dépôt) :
//   VAPID_PUBLIC   la clé publique VAPID (base64url, 65 octets ; la même que FOURNIL_CONFIG.vapid dans fournil/config.js)
//   VAPID_PRIVATE  la clé privée VAPID (base64url, 32 octets)
//   VAPID_SUJET    « mailto:… » ou l'adresse du jeu (https://devclaudeapp.github.io/gamemobil/fournil/)
//   CRON_SECRET    la valeur que pg_cron envoie (24 caractères au moins)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase dans l'environnement de la fonction : la clé de service
// n'est lue qu'ici, jamais écrite nulle part.
//
// Dans le tableau de bord, « Verify JWT » doit être DÉSACTIVÉ pour cette fonction : pg_cron s'annonce avec CRON_SECRET (vérifié
// ci-dessous), pas avec une clé de Supabase.
//
// Test : test/fournil-notifier.test.cjs (Node, un faux web-push et un faux Supabase).

import webpush from 'npm:web-push@3.6.7';

type Abonnement = { endpoint: string; p256dh: string; auth: string };
type Notif = { notif_id: number; type: string; titre: string; texte: string; url: string; subs: Abonnement[] };
type Env = { get(nom: string): string | undefined };
type Outils = { webpush: any; fetch: typeof fetch; journal?: (m: string) => void };

const LIMITE = 100; // notifications par tournée (toutes les 5 minutes)
const DUREE_VIE: Record<string, number> = { pleine: 6 * 3600, essai: 600, pourboire: 24 * 3600, evenement: 6 * 3600, objectif: 24 * 3600 };
// les services de notifications des navigateurs, comme fournil_endpoint_valable côté SQL : on ne poste jamais ailleurs
const ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)\/[!-~]*$/;

// comparer deux secrets en temps constant (pas d'indice sur le nombre de caractères justes)
export function egal(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let d = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) d |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return d === 0;
}

function reponse(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

// un appel PostgREST avec la clé de service (celle de l'environnement de la fonction)
async function rpc(env: Env, outils: Outils, nom: string, corps: unknown): Promise<any> {
  const url = (env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const cle = env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const entetes: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json', apikey: cle };
  if (cle.split('.').length === 3) entetes.Authorization = 'Bearer ' + cle; // une clé JWT (l'ancienne forme) ; une clé sb_secret_ passe par apikey seul
  const r = await outils.fetch(`${url}/rest/v1/rpc/${nom}`, { method: 'POST', headers: entetes, body: JSON.stringify(corps) });
  const texte = await r.text();
  if (!r.ok) throw new Error(`${nom} : ${r.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}

// une tournée : lire la file, envoyer, accuser. Rend le bilan (sans aucun secret ni adresse d'appareil).
export async function tournee(env: Env, outils: Outils) {
  const journal = outils.journal || ((m: string) => console.log(m));
  const options = {
    vapidDetails: { subject: env.get('VAPID_SUJET') || '', publicKey: env.get('VAPID_PUBLIC') || '', privateKey: env.get('VAPID_PRIVATE') || '' },
    timeout: 10000,
  };
  const dues: Notif[] = (await rpc(env, outils, 'fournil_notifs_dues', { p_limite: LIMITE })) || [];
  const faites: number[] = [], morts = new Set<string>();
  let envois = 0, echecs = 0;
  await Promise.all(dues.map(async (n) => {
    const contenu = JSON.stringify({ titre: n.titre, texte: n.texte, url: n.url, type: n.type });
    await Promise.all((n.subs || []).map(async (s) => {
      if (!ENDPOINT.test(s.endpoint)) { morts.add(s.endpoint); return; } // (le SQL ne les accepte pas ; par prudence)
      try {
        await outils.webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, contenu,
          { ...options, TTL: DUREE_VIE[n.type] ?? 3600, urgency: n.type === 'essai' ? 'high' : 'normal' });
        envois++;
      } catch (e: any) {
        const code = e && e.statusCode;
        if (code === 404 || code === 410) morts.add(s.endpoint); // l'appareil s'est désabonné, ou l'abonnement a expiré
        else { echecs++; journal(`notification ${n.notif_id} (${n.type}) : échec ${code || ''} ${String(e && e.message || e).slice(0, 120)}`); }
      }
    }));
    faites.push(n.notif_id); // traitée, envoyée ou non : elle ne repart pas (pas de rafales sur un appareil qui refuse)
  }));
  let acquit = { faites: 0, retires: 0 };
  if (faites.length || morts.size) acquit = await rpc(env, outils, 'fournil_notifs_faites', { p_ids: faites, p_morts: [...morts] });
  const bilan = { ok: true, notifications: dues.length, envois, echecs, appareils_retires: acquit.retires || 0 };
  journal(`tournée : ${JSON.stringify(bilan)}`);
  return bilan;
}

// la requête de pg_cron
export async function traiter(req: Request, env: Env, outils: Outils): Promise<Response> {
  const secret = env.get('CRON_SECRET') || '';
  if (secret.length < 24) return reponse(500, { ok: false, erreur: 'CRON_SECRET manquant ou trop court dans les secrets de la fonction' });
  if (req.method !== 'POST') return reponse(405, { ok: false, erreur: 'POST seulement' });
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '');
  if (!m || !egal(m[1].trim(), secret)) return reponse(401, { ok: false, erreur: 'refusé' });
  const manque = ['VAPID_PUBLIC', 'VAPID_PRIVATE', 'VAPID_SUJET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !env.get(k));
  if (manque.length) return reponse(500, { ok: false, erreur: 'secrets manquants : ' + manque.join(', ') });
  if (!/^(mailto:|https:\/\/)/.test(env.get('VAPID_SUJET') || '')) return reponse(500, { ok: false, erreur: 'VAPID_SUJET doit commencer par mailto: ou https://' });
  try {
    return reponse(200, await tournee(env, outils));
  } catch (e: any) {
    (outils.journal || console.error)(`tournée interrompue : ${String(e && e.message || e).slice(0, 300)}`);
    return reponse(500, { ok: false, erreur: 'tournée interrompue (voir les journaux de la fonction)' });
  }
}

Deno.serve((req: Request) => traiter(req, Deno.env, { webpush, fetch }));
