'use client';
import {GAME_REGISTRY} from '@/lib/games/registry';
import {ControlNav} from '@/components/control/nav/ControlNav';
import {PatientContextBanner} from '@/components/control/patients/PatientContextBanner';
import {ResetLiveDisplayOnMount} from '@/components/control/live/ResetLiveDisplayOnMount';
import {GameCard} from './GameCard';
import {LibraryArtwork} from './LibraryArtwork';
import {InteractionIcon} from './InteractionIcon';
import {librarySections} from './presentation';
import styles from './library.module.css';
export function GameLibraryScreen(){
 const sections=librarySections(GAME_REGISTRY);
 return <main dir="rtl" lang="ar" className={styles.library}>
  <ResetLiveDisplayOnMount/>
  <div className={styles.inner}>
   <ControlNav active="library"/>
   <header className={styles.hero}>
    <div className={styles.heroCopy}><div className={styles.overline}>SHUMOS CARE · عوالم الحركة</div><h1>مكتبة الأنشطة</h1><p>تجارب تفتح بابًا للّعب والاكتشاف.<br/>اختر ما يناسب جلستك، بإيقاع الطفل وتوجيه المعالج.</p><div className={styles.heroMeta}><span>{GAME_REGISTRY.length} أنشطة متاحة</span><span>كل حركة، حكاية جديدة</span></div></div>
    <div className={styles.art}><LibraryArtwork/></div>
   </header>
   <PatientContextBanner/>
   <nav className={styles.categories} aria-label="أقسام المكتبة">{sections.map(section=><a className={styles.category} href={`#${section.id}`} key={section.id}><InteractionIcon name={section.icon}/>{section.title}<small>{section.games.length}</small></a>)}</nav>
   <div className={styles.notice}><span aria-hidden="true">◌</span><span>الأقسام تحدد طريقة المشاركة المطلوبة. دعم الأجهزة واتصالها يُراجعان داخل النشاط، والتحكم اليدوي متاح. شارة العرض مستقلة عن جهاز الإدخال.</span></div>
   {sections.map(section=><section id={section.id} key={section.id} className={styles.section} aria-labelledby={`${section.id}-heading`} data-library-category={section.id}>
    <header className={styles.sectionHeader}><span className={styles.sectionIcon}><InteractionIcon name={section.icon}/></span><div><h2 id={`${section.id}-heading`} className={styles.sectionTitle}>{section.title}</h2><span className={styles.english} lang="en" dir="ltr">{section.english}</span></div><span className={styles.count}>{section.games.length} تجربة</span></header>
    <p className={styles.description}>{section.description}</p>
    {section.games.length?<div className={styles.gameGrid}>{section.games.map(game=><GameCard key={game.id} game={game} input={section.input}/>)}</div>:<p className={styles.description}>لا توجد أنشطة مفعّلة في هذا القسم في هذا الإصدار.</p>}
   </section>)}
   <p className={styles.footer}>شموْس كير · مساحة لكل طفل، وخطوة في كل تجربة</p>
  </div>
 </main>;
}
