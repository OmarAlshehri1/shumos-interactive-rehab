# V1 failure audit

Evidence: `before.png` (previous actual Display screenshot), original `../validation/gameplay.mp4`, and renderer/rig/CSS inspection.

- Default seated mode rotated hips −1.1 radians without a knee counter-rotation. Lower legs inherited forward rotation; pelvis was displaced independently of its floating seat/back boxes. Feet lacked ankle compensation.
- Upper arms and lower limbs were compressed into overlapping spheres with unanimated elbow/knee hinges. Oversized hood dominated the short body.
- Perspective camera at z10.8 looking at y1.15, with x±2 actors, left a large unused foreground. Old figures occupied substantially less screen height.
- Hemisphere2.6 + key3.1 + fill1.7 + exposure1.3 against pale walls/floor erased separation.
- Transparent full-body ghost used one material treatment and sat behind the player; inactive head/body overlaps obscured active target joints.
- Large top instructions, labels at bottom10%, and low platforms further compressed the usable scene.

Fixes address skeleton connectivity, grounded neutral feet, knees/ankles, actual chair frame, camera framing, independent active-limb material, resource sharing, and restrained balanced lighting. Feature targets, tolerance, hold logic, session paths and hardware claims are unchanged.
