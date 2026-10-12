const palette = [
    "#ee8069",
    "#59b9bd",
    "#e8be62",
    "#8586ca",
    "#6fae8b",
    "#e5a4bb",
];
export function piece(id, label, shape, size, target, index, requires = []) {
    const scale = Math.min(1, 1.85 / Math.max(size[0], size[2]), 1.65 / size[1]);
    return {
        id,
        label,
        shape,
        size,
        // Stage dimensions are authored from .22; align the assembly to the .12 work-mat surface.
        target: [target[0], target[1] - 0.1, target[2]],
        source: [
            2.6 + (index % 2) * 2.6,
            ((shape === "wheel" ? size[0] : size[1]) * scale) / 2 +
                0.12 +
                (shape === "triangle-flat" ? 0.035 * scale : 0),
            -2.5 + Math.floor(index / 2) * 2.35,
        ],
        color: palette[index % palette.length],
        requires,
    };
}
export const STAGES = [
    {
        id: "first-shapes",
        level: 1,
        title: "أشكالي الأولى",
        instruction: "اختر القطعة، ثم حرّكها إلى مكانها",
        kind: "shapes",
        pieces: [
            piece("square", "مربع", "box", [1.65, 0.7, 1.65], [-5, 0.57, 0], 0),
            piece("circle", "دائرة", "circle", [1.65, 0.7, 1.65], [-2.5, 0.57, 0], 1),
        ],
    },
    {
        id: "three-shapes",
        level: 1,
        title: "ثلاثة أشكال",
        instruction: "ضع كل شكل في مكانه",
        kind: "shapes",
        pieces: [
            piece("square", "مربع", "box", [1.45, 0.7, 1.45], [-5.4, 0.57, -1.6], 0),
            piece("circle", "دائرة", "circle", [1.5, 0.7, 1.5], [-2.5, 0.57, -1.6], 1),
            piece("triangle", "مثلث", "triangle-flat", [1.5, 0.7, 1.5], [-4, 0.57, 1.7], 2),
        ],
    },
    {
        id: "four-shapes",
        level: 1,
        title: "أربعة أشكال",
        instruction: "اختر الشكل المناسب، خذ وقتك",
        kind: "shapes",
        pieces: [
            piece("square", "مربع", "box", [1.4, 0.7, 1.4], [-5.4, 0.57, -1.5], 0),
            piece("circle", "دائرة", "circle", [1.5, 0.7, 1.5], [-2.5, 0.57, -1.5], 1),
            piece("triangle", "مثلث", "triangle-flat", [1.5, 0.7, 1.5], [-5.4, 0.57, 1.6], 2),
            piece("rectangle", "مستطيل", "rectangle", [1.8, 0.7, 1.1], [-2.5, 0.57, 1.6], 3),
        ],
    },
    {
        id: "house",
        level: 2,
        title: "ابنِ بيتًا",
        instruction: "القاعدة أولًا، ثم الجدران والسقف",
        kind: "house",
        pieces: [
            piece("base", "قاعدة البيت", "rectangle", [3.7, 0.4, 2.6], [-3.8, 0.42, 0.3], 0),
            piece("wall-left", "الجدار الأول", "box", [1.45, 1.65, 2], [-4.6, 1.445, 0.3], 1, ["base"]),
            piece("wall-right", "الجدار الثاني", "box", [1.45, 1.65, 2], [-3, 1.445, 0.3], 2, ["base"]),
            piece("roof", "السقف", "triangle", [3.8, 1.55, 2.4], [-3.8, 3.045, 0.3], 3, ["wall-left", "wall-right"]),
        ],
    },
    {
        id: "car",
        level: 2,
        title: "ابنِ سيارة",
        instruction: "ابنِ جسم السيارة وأضف العجلات",
        kind: "car",
        pieces: [
            piece("body", "جسم السيارة", "rectangle", [3.5, 0.75, 1.8], [-3.8, 1.25, 0.4], 0),
            piece("wheel-left", "العجلة الأولى", "wheel", [1.05, 0.5, 1.05], [-4.9, 0.745, 1.35], 1, ["body"]),
            piece("wheel-right", "العجلة الثانية", "wheel", [1.05, 0.5, 1.05], [-2.7, 0.745, 1.35], 2, ["body"]),
            piece("cabin", "مقصورة السيارة", "box", [1.8, 1.1, 1.5], [-3.65, 2.175, 0.4], 3, ["body"]),
        ],
    },
    {
        id: "robot",
        level: 2,
        title: "ابنِ روبوتًا",
        instruction: "الجسم، ثم الرأس والذراعان",
        kind: "robot",
        pieces: [
            piece("body", "جسم الروبوت", "box", [1.6, 1.8, 1.2], [-3.8, 1.12, 0.6], 0),
            piece("head", "رأس الروبوت", "box", [1.35, 1.1, 1.1], [-3.8, 2.62, 0.6], 1, ["body"]),
            piece("arm-left", "الذراع الأولى", "rectangle", [0.75, 1.65, 0.8], [-5.1, 1.3, 0.6], 2, ["body"]),
            piece("arm-right", "الذراع الثانية", "rectangle", [0.75, 1.65, 0.8], [-2.5, 1.3, 0.6], 3, ["body"]),
        ],
    },
    {
        id: "tower",
        level: 3,
        title: "ابنِ برجًا",
        instruction: "ضع المكعبات فوق بعضها، واحدًا تلو الآخر",
        kind: "tower",
        pieces: [
            piece("bottom", "المكعب الأول", "box", [2.1, 1.3, 2.1], [-3.8, 0.87, 0.5], 0),
            piece("middle", "المكعب الثاني", "box", [1.8, 1.3, 1.8], [-3.8, 2.17, 0.5], 1, ["bottom"]),
            piece("top", "المكعب الثالث", "box", [1.5, 1.3, 1.5], [-3.8, 3.47, 0.5], 2, ["middle"]),
        ],
    },
    {
        id: "bridge",
        level: 3,
        title: "ابنِ جسرًا",
        instruction: "الدعامتان أولًا، ثم طريق الجسر",
        kind: "bridge",
        pieces: [
            piece("support-left", "الدعامة الأولى", "box", [1.15, 1.6, 2], [-5.4, 1.02, 0.5], 0),
            piece("support-right", "الدعامة الثانية", "box", [1.15, 1.6, 2], [-2.2, 1.02, 0.5], 1),
            piece("deck", "طريق الجسر", "rectangle", [5, 0.45, 2.15], [-3.8, 2.045, 0.5], 2, ["support-left", "support-right"]),
        ],
    },
    {
        id: "castle",
        level: 3,
        title: "ابنِ قلعة",
        instruction: "القاعدة والجدران، ثم الأبراج والراية",
        kind: "castle",
        pieces: [
            piece("base", "قاعدة القلعة", "rectangle", [4.8, 0.4, 2.8], [-3.8, 0.42, 0.4], 0),
            piece("wall", "جدار القلعة", "rectangle", [2.7, 1.7, 0.8], [-3.8, 1.47, 0.8], 1, ["base"]),
            piece("tower-left", "البرج الأول", "circle", [1.25, 2.7, 1.25], [-5.6, 1.97, 0.4], 2, ["base"]),
            piece("tower-right", "البرج الثاني", "circle", [1.25, 2.7, 1.25], [-2, 1.97, 0.4], 3, ["base"]),
            piece("flag", "راية القلعة", "flag", [1.4, 1.3, 0.22], [-3.8, 3.32, 0.8], 4, ["wall", "tower-left", "tower-right"]),
        ],
    },
];
// Globally unique piece identity; prerequisites use the same stage namespace.
for (const stage of STAGES) {
    stage.pieces = stage.pieces.map((p) => ({
        ...p,
        id: `${stage.id}:${p.id}`,
        requires: p.requires.map((id) => `${stage.id}:${id}`),
    }));
}
export const CAMERA = {
    width: 18,
    height: 10.125,
    sin: 14 / Math.hypot(14, 16),
    cos: 16 / Math.hypot(14, 16),
};
export function project(v) {
    return {
        x: 0.5 + v[0] / CAMERA.width,
        y: 0.5 + (v[2] * CAMERA.sin - v[1] * CAMERA.cos) / CAMERA.height,
    };
}
export function unproject(p, y = 1) {
    return [
        (p.x - 0.5) * CAMERA.width,
        y,
        ((p.y - 0.5) * CAMERA.height + y * CAMERA.cos) / CAMERA.sin,
    ];
}
export function distance(a, b) {
    return Math.hypot(((a.x - b.x) * 16) / 9, a.y - b.y);
}
