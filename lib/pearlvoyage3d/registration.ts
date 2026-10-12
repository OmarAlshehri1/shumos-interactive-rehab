/** Feature flag: dev defaults on, production requires NEXT_PUBLIC_PEARL_VOYAGE_3D=true. Rollback: unset or set false. */
export const PEARL_VOYAGE_ENABLED = process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_PEARL_VOYAGE_3D !== 'false' : process.env.NEXT_PUBLIC_PEARL_VOYAGE_3D === 'true';
export const PEARL_VOYAGE_REGISTRATION = { id: 'pearl-voyage-3d', nameAr: 'قارب اللؤلؤ', nameEn: 'Pearl Voyage 3D', shortDescriptionAr: 'أبحر بقارب جميل في محيط ساحر، وتعرّف على أسماك ودودة واجمعها. توجيه بالمقود والدواسات أو بالتحكم اليدوي الكامل.', focusTagsAr: ['توجيه القارب', 'اكتشاف وثبات'], status: 'ready', surfaceType: 'WALL', route: '/control/pearl-voyage-3d', sensorCompatible: false } as const;
export const GAME_ID = 'pearl-voyage-3d' as const;
