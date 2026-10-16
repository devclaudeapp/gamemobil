// Le Fournil — le classement en ligne (Supabase). Seulement l'adresse du projet et sa clé PUBLIQUE (« publishable ») :
// elles sont faites pour être dans la page. Jamais la clé secrète (service_role / « secret ») ici ni ailleurs dans le dépôt.
// Sans ce fichier (l'artefact Claude), le classement se cache et le jeu marche comme avant.
// bearer : envoyer aussi « Authorization: Bearer <clé publique> » (comme supabase-js) ; false pour n'envoyer que l'en-tête apikey.
window.FOURNIL_CONFIG = { supabaseUrl: 'https://jklbitrlkfrktmnarejc.supabase.co', supabaseKey: 'sb_publishable_T4XlWAUqurOWo8T9GNkuaA_TPPf4ss3', bearer: true,
  // vapid : la clé PUBLIQUE des notifications (Web Push). La clé privée n'est que dans les secrets de la fonction notifier (Supabase).
  vapid: 'BLUFcxdTHToV2umXl_-89TUi5k2RDKDznntvz0tnzVTRf9R-M7OnhKjUKMj1SiiCF-UiRQL_2HcWlD4CsgJQOI8' };
