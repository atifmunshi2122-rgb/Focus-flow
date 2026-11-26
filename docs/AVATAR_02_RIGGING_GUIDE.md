# Avatar 02 (`character.glb`) — Free Humanoid Rigging Workflow

## Current Asset Status
- **Source File:** `public/models/avatars/avatar-02.glb` (preserved untouched)
- **Meshes (`11`):** `Head`, `Eyes`, `Eyebrows`, `Mouth`, `Hair`, `Tee`, `Hoodie`, `Hands`, `Watch`, `Pants`, `Shoes`
- **Geometry:** `18,465` vertices / `34,304` triangles (`0.607m W × 1.773m H × 0.396m D`, Y-up, origin at feet `y = 0`)
- **Current Rig:** Unrigged static mesh (`skins: 0`, `bones: 0`, `animations: 0`)
- **Environment Limitation:** `blender` is not installed in the current environment, so automated skeletal skinning was not fabricated.

## Free Manual Rigging Steps (Blender + Mixamo or AccuRIG)

1. **Import into Blender (Free, Open Source):**
   - Open Blender -> `File -> Import -> glTF 2.0 (.glb/.gltf)` -> select `public/models/avatars/avatar-02.glb`.
   - Select all 11 mesh objects and export as `FBX` (`File -> Export -> FBX (.fbx)`, `Path Mode: Copy`, `Embed Textures` checked) or keep in Blender for Rigify.
2. **Auto-Rig with Adobe Mixamo (Free) or Reallusion AccuRIG (Free):**
   - Upload the `.fbx` to Mixamo (or open in AccuRIG).
   - Place the joint markers on **Chin**, **Wrists**, **Elbows**, **Knees**, and **Groin** (symmetrical).
   - Verify the generated skeleton includes: `Hips`, `Spine`, `Chest`, `Neck`, `Head`, `Shoulder.L/R`, `UpperArm.L/R`, `LowerArm.L/R`, `Hand.L/R`, `UpperLeg.L/R`, `LowerLeg.L/R`, `Foot.L/R`.
   - Test **Sitting**, **Typing**, and **Idle** poses to confirm `Hoodie`, `Pants`, and `Watch` deform cleanly without clipping.
3. **Export Rigged GLB & Update Catalog:**
   - Export as a separate file `public/models/avatars/avatar-02-rigged.glb` (preserve original `avatar-02.glb`).
   - Update `avatar-02` in `src/features/avatar/avatar-catalog.ts` (`isRigged: true`, `hasHumanoidSkeleton: true`, `animationSupport: 'procedural_skeletal'`, `supportedPoses: ['standing', 'seated']`, `rigStatus: 'rigged_21_bones_procedural'`).

