import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, BloomEffect, ToneMappingEffect, ToneMappingMode, TiltShiftEffect, VignetteEffect, HueSaturationEffect, BrightnessContrastEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
globalThis.FOURNIL_HD = { MeshoptDecoder, GLTFLoader, SkeletonUtils, EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, BloomEffect, ToneMappingEffect, ToneMappingMode, TiltShiftEffect, VignetteEffect, HueSaturationEffect, BrightnessContrastEffect, N8AOPostPass };
