import * as THREE from 'three';
import type { UserAvatarCustomization } from './avatar-catalog.ts';

export type AvatarMaterialProfileId = 'avatar-01' | 'avatar-02' | 'legacy_rigged';

interface ModelMaterialMapping {
  hair: readonly string[];
  hairHighlight: readonly string[];
  iris: readonly string[];
  irisInner: readonly string[];
  outfitPrimary: readonly string[];
  outfitSecondary: readonly string[];
  pants: readonly string[];
  shoes: readonly string[];
  protected: ReadonlySet<string>;
}

const MODEL_MATERIAL_MAPPINGS: Record<AvatarMaterialProfileId, ModelMaterialMapping> = {
  'avatar-01': {
    hair: ['hair'],
    hairHighlight: ['hair_light'],
    iris: ['iris_outer'],
    irisInner: ['iris_inner'],
    outfitPrimary: ['cardigan'],
    outfitSecondary: ['shirt', 'cardigan_trim'],
    pants: ['navy_pants', 'navy_dark'],
    shoes: ['shoe_lav', 'shoe_white'],
    protected: new Set(['skin', 'blush', 'eye_white', 'pupil', 'lash', 'brow', 'lips', 'outline', 'sole', 'pearl']),
  },
  'avatar-02': {
    hair: ['hair'],
    hairHighlight: [],
    iris: ['iris'],
    irisInner: [],
    outfitPrimary: ['navy', 'navy_rib'],
    outfitSecondary: ['tee'],
    pants: ['black', 'black_rib'],
    shoes: ['shoe_navy'],
    protected: new Set(['skin', 'eye_white', 'pupil', 'mouth', 'sole', 'trim', 'white', 'logo', 'watch_band', 'watch_face', 'screen']),
  },
  legacy_rigged: {
    hair: ['HairMain'],
    hairHighlight: [],
    iris: ['EyeIris'],
    irisInner: [],
    outfitPrimary: ['OutfitPrimary'],
    outfitSecondary: [],
    pants: [],
    shoes: [],
    protected: new Set(['Skin', 'EyeWhite', 'Pupil']),
  },
};

export function inferMaterialProfile(avatarIdOrUrl?: string): AvatarMaterialProfileId {
  if (!avatarIdOrUrl) return 'avatar-01';
  if (avatarIdOrUrl.includes('avatar-01')) return 'avatar-01';
  if (avatarIdOrUrl.includes('avatar-02')) return 'avatar-02';
  return 'legacy_rigged';
}

function getHairPbrPreset(preset?: UserAvatarCustomization['hairMaterial']): { roughness: number; metalness: number } {
  if (preset === 'glossy') return { roughness: 0.25, metalness: 0.14 };
  if (preset === 'matte') return { roughness: 0.78, metalness: 0.0 };
  return { roughness: 0.42, metalness: 0.06 }; // 'silky' default
}

/**
 * Applies user-wise material customization to a cloned Three.js scene without mutating
 * cached GLB materials globally. Caches original materials for clean Reset and disposes
 * previously cloned materials to prevent GPU memory leaks.
 */
export function applyAvatarMaterialCustomization(
  clonedScene: THREE.Object3D,
  profileId: AvatarMaterialProfileId,
  customization?: UserAvatarCustomization | null
): void {
  const mapping = MODEL_MATERIAL_MAPPINGS[profileId] || MODEL_MATERIAL_MAPPINGS.legacy_rigged;
  const hairPbr = getHairPbrPreset(customization?.hairMaterial);
  const irisHex = customization?.irisColor || customization?.eyeColor;
  const outfitPrimaryHex = customization?.outfitPrimary || customization?.outfitColor;

  clonedScene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Toggle built-in Watch mesh on avatar-02 when watch accessory is configured
    if (profileId === 'avatar-02' && mesh.name === 'Watch' && customization?.accessories) {
      mesh.visible = customization.accessories.includes('watch');
    }

    // Preserve pristine original materials on first pass
    if (!mesh.userData.__ffOriginalMaterials) {
      mesh.userData.__ffOriginalMaterials = Array.isArray(mesh.material)
        ? [...mesh.material]
        : [mesh.material];
    }

    // Dispose any previously generated cloned materials before creating new ones
    if (Array.isArray(mesh.userData.__ffClonedMaterials)) {
      for (const oldMat of mesh.userData.__ffClonedMaterials as THREE.Material[]) {
        oldMat?.dispose?.();
      }
      mesh.userData.__ffClonedMaterials = null;
    }

    const origList = mesh.userData.__ffOriginalMaterials as THREE.Material[];
    const nextCloned: THREE.Material[] = [];

    const nextMaterials = origList.map((rawMat) => {
      const mat = rawMat as THREE.MeshStandardMaterial;
      if (!mat || typeof mat.clone !== 'function') return rawMat;

      const clonedMat = mat.clone();
      nextCloned.push(clonedMat);
      const mName = clonedMat.name;

      // Protected materials: only tune subtle anime lighting response, never recolor
      if (mapping.protected.has(mName)) {
        if (mName === 'skin') {
          clonedMat.roughness = 0.68;
          clonedMat.metalness = 0;
          clonedMat.envMapIntensity = 0.75;
        } else if (mName === 'eye_white') {
          clonedMat.roughness = 0.14;
          clonedMat.metalness = 0;
        } else if (mName === 'blush' || mName === 'lips' || mName === 'mouth') {
          clonedMat.roughness = 0.52;
        }
        return clonedMat;
      }

      if (mapping.hair.includes(mName)) {
        clonedMat.roughness = hairPbr.roughness;
        clonedMat.metalness = hairPbr.metalness;
        if (customization?.hairColor) {
          clonedMat.color.set(customization.hairColor);
        }
      } else if (mapping.hairHighlight.includes(mName)) {
        clonedMat.roughness = hairPbr.roughness;
        clonedMat.metalness = hairPbr.metalness;
        if (customization?.hairColor) {
          clonedMat.color.set(customization.hairColor).offsetHSL(0, 0.04, 0.12);
        }
      } else if (mapping.iris.includes(mName)) {
        clonedMat.roughness = 0.18;
        clonedMat.metalness = 0.05;
        if (irisHex) {
          clonedMat.color.set(irisHex);
          clonedMat.emissive.set(irisHex);
          clonedMat.emissiveIntensity = 0.16;
        }
      } else if (mapping.irisInner.includes(mName)) {
        clonedMat.roughness = 0.16;
        clonedMat.metalness = 0.05;
        if (irisHex) {
          clonedMat.color.set(irisHex).offsetHSL(0, 0.05, 0.12);
          clonedMat.emissive.set(irisHex);
          clonedMat.emissiveIntensity = 0.3;
        }
      } else if (mapping.outfitPrimary.includes(mName)) {
        clonedMat.roughness = 0.68;
        if (outfitPrimaryHex) {
          clonedMat.color.set(outfitPrimaryHex);
        }
      } else if (mapping.outfitSecondary.includes(mName)) {
        clonedMat.roughness = 0.72;
        if (customization?.outfitSecondary) {
          clonedMat.color.set(customization.outfitSecondary);
        }
      } else if (mapping.pants.includes(mName)) {
        clonedMat.roughness = 0.76;
        if (customization?.pantsColor) {
          clonedMat.color.set(customization.pantsColor);
          if (mName.endsWith('_dark') || mName.endsWith('_rib')) {
            clonedMat.color.offsetHSL(0, 0, -0.05);
          }
        }
      } else if (mapping.shoes.includes(mName)) {
        clonedMat.roughness = 0.55;
        if (customization?.shoesColor) {
          clonedMat.color.set(customization.shoesColor);
        }
      }

      return clonedMat;
    });

    mesh.userData.__ffClonedMaterials = nextCloned;
    mesh.material = Array.isArray(mesh.material) ? nextMaterials : nextMaterials[0];
  });
}

export function disposeClonedAvatarMaterials(clonedScene: THREE.Object3D): void {
  clonedScene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.userData.__ffClonedMaterials)) {
      for (const mat of mesh.userData.__ffClonedMaterials as THREE.Material[]) {
        mat?.dispose?.();
      }
      mesh.userData.__ffClonedMaterials = null;
    }
  });
}

