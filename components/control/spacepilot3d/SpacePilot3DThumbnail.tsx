/** Library illustration only. The Display uses live meshes and world simulation. */
export function SpacePilot3DThumbnail(){return <svg viewBox="0 0 320 140" className="aspect-[16/7] w-full rounded-t-2xl bg-slate-950" aria-hidden="true">
  <ellipse cx="76" cy="32" rx="25" ry="24" fill="#344c6a"/><ellipse cx="83" cy="28" rx="16" ry="20" fill="#547b9b"/>
  <g fill="#a7c5db">{[[22,72],[46,21],[115,18],[213,12],[294,80],[264,28],[145,52],[174,22]].map(([x,y])=><circle key={`${x}/${y}`} cx={x} cy={y} r="1"/>)}</g>
  <g fill="none" stroke="#f4cb63"><ellipse cx="229" cy="52" rx="32" ry="36" strokeWidth="6"/><ellipse cx="277" cy="29" rx="12" ry="14" strokeWidth="3"/></g>
  <path d="M126 64 L88 110 L134 101 L164 114 L154 85 Z" fill="#bbd6e3" stroke="#65849a" strokeWidth="2"/>
  <path d="M126 64 L117 98 L139 105 L139 85 Z" fill="#e4edf2"/><path d="M126 71 L122 86 L132 91 L133 83 Z" fill="#23678c"/>
  <path d="M110 95 L104 122 M145 104 L142 131" stroke="#42cfff" strokeWidth="8" opacity=".4"/><path d="M110 95 L108 111 M145 104 L143 119" stroke="#b8f4ff" strokeWidth="5"/>
</svg>;}
