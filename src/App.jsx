import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, ArrowUpRight, Bookmark, BookOpen, Check, ChevronDown,
  Compass, Copy, Download, ExternalLink, Globe2, HeartPulse, History, House, Info,
  Landmark, Leaf, Lightbulb, LockKeyhole, MessageCircle, Mic, Plus, Send,
  ShieldCheck, Sparkles, Sprout, Square, Trash2, Volume2, VolumeX, Wheat, X,
} from 'lucide-react';
import { getDictionary, LANGUAGES } from './i18n.js';
import { useDictation } from './useDictation.js';

const STORAGE_KEY = 'gramsaathi.phase1.v1';
const PAGES = ['ask', 'explore', 'saved', 'about'];
const TOPIC_ORDER = ['schemes', 'farming', 'health'];
const TOPIC_ICONS = { schemes: Landmark, farming: Wheat, health: HeartPulse };
const NAV_ITEMS = [
  { id: 'ask', icon: House, key: 'askNav', mobile: 'mobileAsk' },
  { id: 'explore', icon: Compass, key: 'exploreNav', mobile: 'mobileExplore' },
  { id: 'saved', icon: Bookmark, key: 'savedNav', mobile: 'mobileSaved' },
  { id: 'about', icon: Info, key: 'aboutNav', mobile: 'mobileAbout' },
];

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function makeChat() { return { id: makeId(), title: '', messages: [], updatedAt: Date.now() }; }
function initialState() {
  const fallback = { language: 'en', chats: [makeChat()], activeId: null, saved: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!raw || typeof raw !== 'object') return fallback;
    const chats = Array.isArray(raw.chats)
      ? raw.chats.filter(c => c && typeof c.id === 'string' && Array.isArray(c.messages)).slice(0, 50)
      : [];
    return {
      language: LANGUAGES.some(x => x.code === raw.language) ? raw.language : 'en',
      chats: chats.length ? chats : fallback.chats,
      activeId: typeof raw.activeId === 'string' ? raw.activeId : null,
      saved: Array.isArray(raw.saved) ? raw.saved.filter(x => x && x.id && x.content).slice(0, 100) : [],
    };
  } catch { return fallback; }
}
function currentPage() {
  const page = window.location.hash.replace(/^#/, '').split('?')[0];
  return PAGES.includes(page) ? page : 'ask';
}
function go(page) { window.location.hash = page; }
function shortText(text, count = 32) {
  const chars = Array.from(text || '');
  return chars.length > count ? `${chars.slice(0, count).join('').trim()}…` : text;
}

function Brand() {
  return <a className="brand" href="#ask" aria-label="GramSaathi home">
    <span className="brand-mark"><Sprout size={22} strokeWidth={2.1} /><span className="brand-sun" /></span>
    <span className="brand-copy"><strong>Gram<span>Saathi</span></strong><small>YOUR VILLAGE COMPANION</small></span>
  </a>;
}

function Sidebar({ t, page, chats, activeId, onSelectChat, onNew, status }) {
  const recent = [...chats].filter(c => c.messages.some(m => m.role === 'user')).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
  return <aside className="sidebar">
    <Brand />
    <button type="button" className="new-chat-button" onClick={onNew}><Plus size={18} /><span>{t.newChat}</span><span className="new-chat-shortcut">+</span></button>
    <div className="sidebar-scroll">
      <p className="side-label">{t.menu}</p>
      <nav className="side-nav" aria-label="Main navigation">
        {NAV_ITEMS.map(({ id, icon: Icon, key }) => <a key={id} href={`#${id}`} className={`nav-item ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined}>
          <Icon size={19} strokeWidth={1.8} /><span>{t[key]}</span>{page === id && <span className="nav-current" />}
        </a>)}
      </nav>
      <div className="side-divider" />
      <p className="side-label recent-label">{t.recent}</p>
      <div className="recent-list">
        {recent.length ? recent.map(chat => <button key={chat.id} type="button" className={`recent-item ${chat.id === activeId && page === 'ask' ? 'current' : ''}`} onClick={() => onSelectChat(chat.id)} title={chat.title}>
          <MessageCircle size={15} /><span>{shortText(chat.title, 30)}</span>
        </button>) : <p className="recent-empty">{t.noRecent}</p>}
      </div>
    </div>
    <div className="sidebar-bottom">
      <div className="side-card">
        <span className="side-card-icon"><Leaf size={17} /></span>
        <p className="side-card-eyebrow">{t.sideEyebrow}</p>
        <p className="side-card-title">{t.sideTitle}</p>
        <p className="side-card-body">{t.sideBody}</p>
        <span className="side-card-leaf leaf-one"><Leaf size={37} /></span>
        <span className="side-card-leaf leaf-two"><Leaf size={25} /></span>
      </div>
      <div className="sidebar-status"><span className={`status-dot ${status === 'connected' ? '' : 'offline'}`} /><span>{status === 'checking' ? '…' : status === 'connected' ? t.backendConnected : t.backendDisconnected}</span></div>
    </div>
  </aside>;
}

function Topbar({ t, page, language, setLanguage, status, mode, onHistory, voicePhase }) {
  const pageKey = { ask: 'askNav', explore: 'exploreNav', saved: 'savedNav', about: 'aboutNav' }[page];
  const subKey = { ask: 'askSubtitle', explore: 'exploreSubtitle', saved: 'savedSubtitle', about: 'aboutSubtitle' }[page];
  return <header className="topbar">
    <div className="mobile-brand"><Brand /></div>
    <div className="topbar-heading"><span>{t[subKey]}</span><strong>{t[pageKey]}</strong></div>
    <div className="topbar-actions">
      <button type="button" className="mobile-history" onClick={onHistory} aria-label={t.recent} title={t.recent}><History size={19} /></button>
      <div className="top-status" title={status === 'connected' ? t.backendConnected : t.backendDisconnected}><span className={`status-dot ${status === 'connected' ? '' : 'offline'}`} /><span>{mode === 'live' ? t.liveMode : t.demoMode}</span></div>
      <label className="language-picker" title={voicePhase === 'idle' ? t.language : t.micStopFirst}>
        <Globe2 size={17} strokeWidth={1.8} aria-hidden="true" />
        <span className="sr-only">{t.language}</span>
        <select aria-label={t.language} value={language} disabled={voicePhase !== 'idle'} onChange={e => setLanguage(e.target.value)}>
          {LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.label}</option>)}
        </select>
        <ChevronDown size={15} aria-hidden="true" />
      </label>
    </div>
  </header>;
}

function MobileNav({ page, t }) {
  return <nav className="mobile-nav" aria-label="Main navigation">
    {NAV_ITEMS.map(({ id, icon: Icon, mobile }) => <a key={id} href={`#${id}`} className={page === id ? 'active' : ''} aria-current={page === id ? 'page' : undefined}>
      <Icon size={20} strokeWidth={page === id ? 2.15 : 1.8} /><span>{t[mobile]}</span>
    </a>)}
  </nav>;
}

function Hero({ t }) {
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-art" aria-hidden="true" />
    <div className="hero-content">
      <div className="eyebrow hero-eyebrow"><span className="sun-icon">✳</span>{t.heroEyebrow}</div>
      <h1 id="hero-title">{t.heroTitle}</h1>
      <p>{t.heroDescription}</p>
      <div className="hero-languages"><span className="hero-language-dot" /> <span>{t.heroLanguages}</span><i /> <strong>English · हिन्दी · मराठी · தமிழ்</strong></div>
    </div>
    <div className="hero-corner" aria-hidden="true"><Sparkles size={16} /></div>
  </section>;
}

function DemoNotice({ t, mode }) {
  return <div className="demo-notice">
    <div className="demo-notice-icon"><Sparkles size={17} /></div>
    <div className="demo-notice-copy"><strong>{mode === 'live' ? t.liveTitle : t.demoTitle}</strong><span>{mode === 'live' ? t.liveBody : t.demoBody}</span></div>
    <a href="#about">{t.demoLink}<ArrowRight size={15} /></a>
  </div>;
}

function SectionHeading({ eyebrow, title, description, action, id }) {
  return <div className="section-heading">
    <div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2>{description && <p className="section-description">{description}</p>}</div>
    {action}
  </div>;
}

function TopicCard({ type, t, onTry, large = false }) {
  const Icon = TOPIC_ICONS[type]; const topic = t.topics[type];
  if (large) return <article className={`topic-large topic-${type}`}>
    <div className="topic-large-top"><span className="topic-icon"><Icon size={22} strokeWidth={1.7} /></span><ArrowUpRight size={17} className="topic-corner-arrow" /></div>
    <h3>{topic.name}</h3><p>{topic.short}</p>
    <div className="topic-question">“{topic.question}”</div>
    <button type="button" className="topic-action" onClick={() => onTry(type)}>{t.tryQuestion}<ArrowRight size={16} /></button>
  </article>;
  return <button type="button" className={`topic-card topic-${type}`} onClick={() => onTry(type)}>
    <span className="topic-icon"><Icon size={21} strokeWidth={1.7} /></span>
    <span className="topic-card-copy"><strong>{topic.name}</strong><small>{topic.short}</small></span>
    <ArrowUpRight size={16} className="topic-corner-arrow" />
  </button>;
}

function NoteCard({ t }) {
  return <aside className="note-card">
    <div className="note-icon"><Lightbulb size={19} /></div>
    <p className="eyebrow">{t.noteEyebrow}</p>
    <h3>{t.noteTitle}</h3>
    <p className="note-body">{t.noteBody}</p>
    <a href="#explore">{t.noteLink}<ArrowRight size={16} /></a>
    <div className="note-doodle" aria-hidden="true"><Leaf size={44} strokeWidth={1} /></div>
  </aside>;
}

function Composer({ t, draft, setDraft, onSend, onMic, voicePhase, pending, inputRef }) {
  const voiceActive = voicePhase !== 'idle';
  const tooLong = draft.length > 2000;
  const voiceStatus = voicePhase === 'starting' ? t.micStarting : voicePhase === 'reconnecting' ? t.micReconnecting : voicePhase === 'stopping' ? t.micFinishing : t.micRecording;
  return <form className="composer" onSubmit={onSend}>
    <label className="sr-only" htmlFor="question-input">{t.inputLabel}</label>
    <textarea id="question-input" ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} placeholder={t.placeholder} rows={3} aria-invalid={tooLong || undefined} aria-describedby={tooLong ? 'question-limit' : undefined} />
    {tooLong && <div className="composer-limit" id="question-limit" role="alert">{t.micTooLong}</div>}
    <div className="composer-bottom">
      <button type="button" className={`voice-button ${voiceActive ? 'listening' : ''}`} onClick={onMic} aria-pressed={voiceActive} disabled={voicePhase === 'stopping'}>
        {voiceActive ? <Square size={15} fill="currentColor" /> : <Mic size={17} />}<span>{voicePhase === 'stopping' ? t.micFinishing : voiceActive ? t.listening : t.voiceInput}</span>
      </button>
      <span className="composer-character-count">{draft.length > 1600 ? `${draft.length}/2000` : ''}</span>
      <button type="submit" className="send-button" disabled={!draft.trim() || pending || voiceActive || tooLong}>
        <span>{pending ? t.sending : t.send}</span><Send size={16} />
      </button>
    </div>
    {voiceActive && <div className="dictation-status" role="status" aria-live="polite"><span className="dictation-dot" />{voiceStatus}</div>}
    <div className="composer-hints"><span><LockKeyhole size={12} />{t.privacyHint}</span><span>{t.voiceHint}</span></div>
  </form>;
}

function ResourceLinks({ links, grounding, t }) {
  const citations = grounding?.citations;
  const items = Array.isArray(citations) && citations.length
    ? citations.map((item, index) => ({ id: `citation-${index}`, name: item.title, url: item.url }))
    : links;
  if (!Array.isArray(items) || !items.length) return null;
  const grounded = Array.isArray(citations) && citations.length > 0;
  return <div className="answer-links"><div className="answer-links-title"><span>{grounded ? t.citationsLabel : t.linksLabel}</span><small>{grounded ? t.citationsNote : t.linksNote}</small></div>
    <div className="answer-link-list">{items.map(link => <a key={link.id} href={link.url} target="_blank" rel="noreferrer noopener">{link.name}<ExternalLink size={12} /></a>)}</div>
    {grounding?.searchSuggestions && <div className="google-search-suggestions" dangerouslySetInnerHTML={{ __html: grounding.searchSuggestions }} />}
  </div>;
}

function AnswerCard({ message, t, isSaved, onSave, onCopy, onSpeak, speakingId, showQuestion = false, language, grounding }) {
  let date = '';
  if (showQuestion && message.savedAt) {
    try { date = new Intl.DateTimeFormat(LANGUAGES.find(x => x.code === language)?.date || 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(message.savedAt); } catch { /* date is optional */ }
  }
  return <article className={`answer-card ${showQuestion ? 'saved-answer-card' : ''}`}>
    {showQuestion && <div className="saved-question"><div><small>{t.userLabel}</small><strong>{message.question}</strong></div>{date && <span>{t.savedOn} {date}</span>}</div>}
    <div className="answer-head">
      <span className="answer-avatar"><Sprout size={17} /></span>
      <div className="answer-identity"><strong>{t.saathiLabel}</strong><span>{message.mode === 'live' ? t.liveAnswer : t.demoAnswer}</span></div>
      <div className="answer-actions">
        <button type="button" className="icon-button" onClick={() => onSpeak(message)} aria-label={speakingId === message.id ? t.stopSpeaking : t.speak} title={speakingId === message.id ? t.stopSpeaking : t.speak}>{speakingId === message.id ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
        <button type="button" className="icon-button" onClick={() => onCopy(message.content)} aria-label={t.copy} title={t.copy}><Copy size={16} /></button>
        <button type="button" className={`icon-button ${isSaved ? 'is-saved' : ''}`} onClick={() => onSave(message)} aria-label={isSaved ? t.unsave : t.save} title={isSaved ? t.unsave : t.save} aria-pressed={isSaved}><Bookmark size={17} fill={isSaved ? 'currentColor' : 'none'} /></button>
      </div>
    </div>
    <div className="answer-text">{message.content.split('\n\n').map((paragraph, i) => <p key={i}>{paragraph}</p>)}</div>
    <ResourceLinks links={message.links} grounding={grounding} t={t} />
  </article>;
}

function Conversation({ messages, t, saved, onSave, onCopy, onSpeak, speakingId, onRetry, pending, language, endRef, groundingByMessage }) {
  return <div className="conversation" aria-live="polite">
    {messages.map(message => {
      if (message.role === 'user') return <div className="user-message" key={message.id}><span>{t.userLabel}</span><div>{message.content}</div></div>;
      if (message.role === 'error') return <div className="message-error" key={message.id}><AlertCircle size={18} /><span>{t.apiError}</span><button type="button" onClick={() => onRetry(message.question)}>{t.retry}</button></div>;
      return <AnswerCard key={message.id} message={message} t={t} isSaved={saved.some(x => x.id === message.id)} onSave={onSave} onCopy={onCopy} onSpeak={onSpeak} speakingId={speakingId} language={language} grounding={groundingByMessage?.[message.id]} />;
    })}
    {pending && <div className="thinking"><span className="answer-avatar"><Sprout size={16} /></span><span>{t.sending}</span><span className="thinking-dots"><i /><i /><i /></span></div>}
    <div ref={endRef} />
  </div>;
}

function HomePage({ t, chat, status, mode, groundingByMessage, draft, setDraft, onSend, onMic, voicePhase, pending, inputRef, onTry, onNew, saved, onSave, onCopy, onSpeak, speakingId, onRetry, language, endRef }) {
  const hasMessages = chat.messages.length > 0;
  return <div className="page-wrap home-page">
    {!hasMessages && <Hero t={t} />}
    <DemoNotice t={t} mode={mode} />
    {status === 'disconnected' && <div className="connection-notice"><AlertCircle size={16} />{t.healthLost}</div>}
    <div className={`home-grid ${hasMessages ? 'has-conversation' : ''}`}>
      <section className="chat-section" aria-labelledby="ask-heading">
        <SectionHeading id="ask-heading" eyebrow={t.talkEyebrow} title={hasMessages ? t.conversationHeading : t.askHeading} description={hasMessages ? t.conversationDescription : t.askDescription}
          action={hasMessages && <button type="button" className="text-action new-conversation-small" onClick={onNew}><Plus size={16} />{t.newChat}</button>} />
        {hasMessages && <Conversation messages={chat.messages} t={t} saved={saved} onSave={onSave} onCopy={onCopy} onSpeak={onSpeak} speakingId={speakingId} onRetry={onRetry} pending={pending} language={language} endRef={endRef} groundingByMessage={groundingByMessage} />}
        <Composer t={t} draft={draft} setDraft={setDraft} onSend={onSend} onMic={onMic} voicePhase={voicePhase} pending={pending} inputRef={inputRef} />
      </section>
      <NoteCard t={t} />
    </div>
    <section className="suggestions-section">
      <SectionHeading eyebrow={t.suggestEyebrow} title={t.suggestHeading} description={t.suggestDescription} />
      <div className="topic-grid">{TOPIC_ORDER.map(type => <TopicCard key={type} type={type} t={t} onTry={onTry} />)}</div>
    </section>
    <Footer t={t} />
  </div>;
}

function PageIntro({ eyebrow, title, description }) {
  return <div className="page-intro"><p className="eyebrow"><span className="intro-sparkle">✳</span>{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>;
}

function ExplorePage({ t, onTry, resources, resourcesError, onReload }) {
  return <div className="page-wrap secondary-page">
    <PageIntro eyebrow={t.exploreEyebrow} title={t.exploreTitle} description={t.exploreDescription} />
    <div className="explore-topics">{TOPIC_ORDER.map(type => <TopicCard key={type} type={type} t={t} onTry={onTry} large />)}</div>
    <section className="resources-section">
      <SectionHeading eyebrow={t.officialEyebrow} title={t.officialHeading} description={t.officialDescription} />
      {resourcesError ? <div className="inline-error"><AlertCircle size={18} />{t.resourcesError}<button type="button" onClick={onReload}>{t.retry}</button></div> :
        <div className="resource-grid">{resources.map(resource => <article className="resource-card" key={resource.id}>
          <div className="resource-icon"><BookOpen size={18} /></div>
          <div><p className="resource-org">{resource.organization}</p><h3>{resource.name}</h3><p>{t.resourceDescriptions[resource.id] || ''}</p></div>
          <a href={resource.url} target="_blank" rel="noreferrer noopener">{t.openWebsite}<ArrowUpRight size={15} /></a>
        </article>)}</div>}
    </section>
    <Footer t={t} />
  </div>;
}

function SavedPage({ t, saved, onSave, onCopy, onSpeak, speakingId, language, groundingByMessage }) {
  return <div className="page-wrap secondary-page">
    <PageIntro eyebrow={t.savedEyebrow} title={t.savedTitle} description={t.savedDescription} />
    {saved.length === 0 ? <div className="empty-state">
      <div className="empty-icon"><Bookmark size={25} /></div><h2>{t.savedEmptyTitle}</h2><p>{t.savedEmptyBody}</p><a href="#ask" className="primary-link">{t.startAsking}<ArrowRight size={16} /></a>
    </div> : <div className="saved-list">{saved.map(message => <AnswerCard key={message.id} message={message} t={t} isSaved onSave={onSave} onCopy={onCopy} onSpeak={onSpeak} speakingId={speakingId} showQuestion language={language} grounding={groundingByMessage?.[message.id]} />)}</div>}
    <Footer t={t} />
  </div>;
}

function AboutPage({ t, onInstall, installed, onClearHistory, onClearSaved }) {
  const cards = [
    { icon: Sparkles, title: t.aboutDemoTitle, body: t.aboutDemoBody },
    { icon: BookOpen, title: t.aboutNextTitle, body: t.aboutNextBody },
    { icon: Mic, title: t.aboutVoiceTitle, body: t.aboutVoiceBody },
    { icon: ShieldCheck, title: t.aboutPrivacyTitle, body: t.aboutPrivacyBody },
  ];
  return <div className="page-wrap secondary-page about-page">
    <PageIntro eyebrow={t.aboutEyebrow} title={t.aboutTitle} description={t.aboutDescription} />
    <div className="about-grid">{cards.map(({ icon: Icon, title, body }) => <article className="about-card" key={title}><span className="about-icon"><Icon size={21} /></span><h2>{title}</h2><p>{body}</p></article>)}</div>
    <div className="install-card"><div className="install-icon"><Download size={22} /></div><div><h2>{t.aboutOfflineTitle}</h2><p>{t.aboutOfflineBody}</p></div><button type="button" className="primary-link install-button" onClick={onInstall} disabled={installed}>{installed ? t.installed : t.install}<Download size={16} /></button></div>
    <div className="manage-card"><div><h2>{t.manageTitle}</h2><p>{t.manageBody}</p></div><div className="manage-buttons"><button type="button" onClick={onClearHistory}><Trash2 size={16} />{t.clearHistory}</button><button type="button" onClick={onClearSaved}><Trash2 size={16} />{t.clearSaved}</button></div></div>
    <div className="medical-note"><HeartPulse size={17} /><span>{t.notMedical}</span></div>
    <Footer t={t} />
  </div>;
}

function Footer({ t }) {
  return <footer className="footer"><span><Sprout size={15} /> GramSaathi</span><p>{t.disclaimer}</p></footer>;
}

function useDialogFocus(closeRef, onClose) {
  useEffect(() => {
    const previous = document.activeElement; closeRef.current?.focus();
    const onKey = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const items = [...(dialog?.querySelectorAll('button:not([disabled]), a[href], select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])].filter(el => el.getClientRects().length);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [closeRef, onClose]);
}

function HistoryModal({ t, chats, activeId, onSelect, onNew, onClose }) {
  const closeRef = useRef(null);
  useDialogFocus(closeRef, onClose);
  const recent = [...chats].filter(c => c.messages.some(m => m.role === 'user')).sort((a, b) => b.updatedAt - a.updatedAt);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <button type="button" className="modal-close icon-button" ref={closeRef} onClick={onClose} aria-label={t.close}><X size={19} /></button>
      <span className="about-icon"><History size={22} /></span><h2 id="history-title">{t.recent}</h2>
      <button type="button" className="new-chat-button history-new" onClick={() => { onClose(); onNew(); }}><Plus size={18} />{t.newChat}</button>
      <div className="history-modal-list">{recent.length ? recent.map(chat => <button key={chat.id} type="button" className={`history-modal-item ${chat.id === activeId ? 'current' : ''}`} onClick={() => { onClose(); onSelect(chat.id); }}><MessageCircle size={16} /><span>{chat.title}</span></button>) : <p>{t.noRecent}</p>}</div>
    </div>
  </div>;
}

function InstallModal({ t, onClose }) {
  const closeRef = useRef(null);
  useDialogFocus(closeRef, onClose);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <button type="button" className="modal-close icon-button" ref={closeRef} onClick={onClose} aria-label={t.close}><X size={19} /></button>
      <span className="about-icon"><Download size={22} /></span><h2 id="install-title">{t.installTitle}</h2>
      <p>{t.installAndroid}</p><p>{t.installIos}</p><button type="button" className="primary-link" onClick={onClose}>{t.close}</button>
    </div>
  </div>;
}

export default function App() {
  const [initial] = useState(initialState);
  const [language, setLanguage] = useState(initial.language);
  const [chats, setChats] = useState(initial.chats);
  const [activeId, setActiveId] = useState(initial.activeId || initial.chats[0].id);
  const [saved, setSaved] = useState(initial.saved);
  const [page, setPage] = useState(currentPage);
  const [draft, setDraft] = useState('');
  const [pendingChats, setPendingChats] = useState({});
  const [speakingId, setSpeakingId] = useState(null);
  const [status, setStatus] = useState('checking');
  const [mode, setMode] = useState('demo');
  const [resources, setResources] = useState([]);
  const [groundingByMessage, setGroundingByMessage] = useState({});
  const [resourcesError, setResourcesError] = useState(false);
  const [toast, setToast] = useState('');
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installOpen, setInstallOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
  const inputRef = useRef(null), endRef = useRef(null), toastTimer = useRef(null);
  const audioRef = useRef(null), speechRequestRef = useRef(0);
  const t = getDictionary(language);
  const activeChat = chats.find(c => c.id === activeId) || chats[0];
  const pending = Boolean(activeChat && pendingChats[activeChat.id]);
  const notify = useCallback(message => {
    clearTimeout(toastTimer.current); setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  }, []);
  const { phase: voicePhase, start: startDictation, stop: stopDictation } = useDictation({
    speechLocale: LANGUAGES.find(x => x.code === language)?.speech || 'en-IN',
    onTranscript: text => setDraft(previous => previous.trimEnd() ? `${previous.trimEnd()} ${text}` : text),
    onError: code => notify({ unsupported: t.micUnavailable, permission: t.micDenied, network: t.micNetwork, interrupted: t.micInterrupted, error: t.micError, empty: t.micNoSpeech }[code] || t.micError),
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ language, chats, activeId, saved })); } catch { /* Storage can be disabled; the current session still works. */ }
    document.documentElement.lang = language;
  }, [language, chats, activeId, saved]);
  useEffect(() => {
    const listener = () => setPage(currentPage());
    window.addEventListener('hashchange', listener);
    return () => window.removeEventListener('hashchange', listener);
  }, []);
  useEffect(() => {
    const onPrompt = event => { event.preventDefault(); setInstallPrompt(event); };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = response.ok && await response.json();
      setStatus(data?.status === 'ok' ? 'connected' : 'disconnected');
      if (data?.mode === 'live' || data?.mode === 'demo') setMode(data.mode);
    } catch { setStatus('disconnected'); }
  }, []);
  const loadResources = useCallback(async () => {
    try {
      setResourcesError(false);
      const response = await fetch('/api/resources');
      if (!response.ok) throw new Error('Resources unavailable');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid response');
      setResources(data);
    } catch { setResourcesError(true); }
  }, []);
  useEffect(() => {
    checkHealth(); loadResources();
    const online = () => { checkHealth(); loadResources(); };
    const offline = () => setStatus('disconnected');
    window.addEventListener('online', online); window.addEventListener('offline', offline);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
  }, [checkHealth, loadResources]);
  useEffect(() => () => {
    clearTimeout(toastTimer.current); window.speechSynthesis?.cancel?.(); speechRequestRef.current += 1;
    const current = audioRef.current;
    if (current) { current.audio.pause(); URL.revokeObjectURL(current.url); audioRef.current = null; }
  }, []);
  // Leaving the question page stops the microphone rather than listening in the background.
  useEffect(() => { if (page !== 'ask') stopDictation(); }, [page, stopDictation]);
  useEffect(() => {
    if (page === 'ask' && activeChat?.messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [page, activeId, activeChat?.messages.length, pending]);

  const updateChat = (id, update) => setChats(previous => previous.map(c => c.id === id ? update(c) : c));
  const focusComposer = () => setTimeout(() => { inputRef.current?.focus(); inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
  const canChangeQuestion = () => {
    if (voicePhase !== 'idle') { notify(t.micStopFirst); return false; }
    return true;
  };
  const newConversation = () => {
    if (!canChangeQuestion()) return;
    if (activeChat.messages.length === 0) { setDraft(''); go('ask'); focusComposer(); return; }
    const chat = makeChat(); setChats(previous => [chat, ...previous]); setActiveId(chat.id); setDraft(''); go('ask');
    setTimeout(() => inputRef.current?.focus(), 100);
  };
  const selectChat = id => { if (!canChangeQuestion()) return; setActiveId(id); setDraft(''); go('ask'); };
  const tryTopic = type => { if (!canChangeQuestion()) return; setDraft(t.topics[type].question); go('ask'); focusComposer(); };
  const retryQuestion = question => { if (!canChangeQuestion()) return; setDraft(question); go('ask'); focusComposer(); };

  const sendQuestion = async event => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || pending || question.length > 2000 || voicePhase !== 'idle') return;
    const chatId = activeChat.id;
    const userMessage = { id: makeId(), role: 'user', content: question, language, createdAt: Date.now() };
    updateChat(chatId, chat => ({ ...chat, title: chat.title || shortText(question, 52), messages: [...chat.messages, userMessage], updatedAt: Date.now() }));
    setDraft(''); setPendingChats(previous => ({ ...previous, [chatId]: true }));
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: question, language }) });
      if (!response.ok) throw new Error('Request failed');
      const data = await response.json();
      if (!['demo', 'live'].includes(data.mode) || typeof data.answer !== 'string') throw new Error('Unexpected response');
      const answer = { id: data.id || makeId(), role: 'assistant', content: data.answer, question, language: data.language, topic: data.topic, links: data.links, mode: data.mode, createdAt: Date.now() };
      if (data.citations?.length || data.search_suggestions) setGroundingByMessage(previous => ({ ...previous, [answer.id]: { citations: data.citations || [], searchSuggestions: data.search_suggestions || '' } }));
      updateChat(chatId, chat => ({ ...chat, messages: [...chat.messages, answer], updatedAt: Date.now() }));
      setStatus('connected');
    } catch {
      updateChat(chatId, chat => ({ ...chat, messages: [...chat.messages, { id: makeId(), role: 'error', question }], updatedAt: Date.now() }));
      setStatus('disconnected'); notify(t.apiError);
    } finally { setPendingChats(previous => { const next = { ...previous }; delete next[chatId]; return next; }); }
  };

  const useMic = () => {
    if (voicePhase === 'idle') startDictation();
    else if (voicePhase !== 'stopping') stopDictation();
  };

  const speak = async message => {
    const requestId = ++speechRequestRef.current;
    const stopCurrentAudio = () => {
      const current = audioRef.current;
      if (current) {
        current.audio.pause(); current.audio.currentTime = 0;
        URL.revokeObjectURL(current.url); audioRef.current = null;
      }
    };
    if (speakingId === message.id) {
      window.speechSynthesis?.cancel?.(); stopCurrentAudio(); setSpeakingId(null); return;
    }
    window.speechSynthesis?.cancel?.(); stopCurrentAudio(); setSpeakingId(message.id);

    const sayWithDeviceVoice = async () => {
      const synth = window.speechSynthesis;
      if (!synth || !window.SpeechSynthesisUtterance) return false;
      let voices = synth.getVoices();
      // Some browsers populate their voice list asynchronously after page load.
      if (!voices.length && synth.addEventListener) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, 1200);
          synth.addEventListener('voiceschanged', () => { clearTimeout(timer); resolve(); }, { once: true });
        });
        voices = synth.getVoices();
      }
      const target = LANGUAGES.find(x => x.code === (message.language || language)) || LANGUAGES[0];
      const voice = voices.find(v => v.lang.toLowerCase() === target.speech.toLowerCase())
        || voices.find(v => v.lang.toLowerCase().split('-')[0] === target.code);
      if (!voice || requestId !== speechRequestRef.current) return false;
      const utterance = new SpeechSynthesisUtterance(message.content);
      utterance.lang = target.speech; utterance.voice = voice;
      utterance.onend = () => { if (requestId === speechRequestRef.current) setSpeakingId(null); };
      utterance.onerror = () => { if (requestId === speechRequestRef.current) { setSpeakingId(null); notify(t.speechError); } };
      synth.speak(utterance);
      return true;
    };

    try {
      const response = await fetch('/api/speak', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content, language: message.language || language }),
      });
      if (!response.ok) throw new Error(`TTS request failed (${response.status})`);
      const blob = await response.blob();
      if (!blob.size || requestId !== speechRequestRef.current) throw new Error('No audio returned');
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = { audio, url };
      audio.onended = () => {
        if (requestId === speechRequestRef.current) setSpeakingId(null);
        URL.revokeObjectURL(url); if (audioRef.current?.url === url) audioRef.current = null;
      };
      await audio.play();
    } catch {
      if (requestId !== speechRequestRef.current) return;
      stopCurrentAudio();
      const started = await sayWithDeviceVoice();
      if (!started && requestId === speechRequestRef.current) {
        setSpeakingId(null); notify(t.speechError);
      }
    }
  };

  const copyAnswer = async text => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const element = document.createElement('textarea'); element.value = text; element.style.position = 'fixed'; element.style.opacity = '0';
        document.body.appendChild(element); element.select(); const ok = document.execCommand('copy'); element.remove(); if (!ok) throw new Error('copy failed');
      }
      notify(t.copied);
    } catch { notify(t.copyFailed); }
  };
  const toggleSaved = message => setSaved(previous => previous.some(x => x.id === message.id) ? previous.filter(x => x.id !== message.id) : [{ ...message, savedAt: Date.now() }, ...previous]);
  const clearHistory = () => {
    if (!window.confirm(t.confirmHistory)) return;
    const chat = makeChat(); setChats([chat]); setActiveId(chat.id); setDraft(''); notify(t.historyCleared);
  };
  const clearSaved = () => { if (window.confirm(t.confirmSaved)) { setSaved([]); notify(t.savedCleared); } };
  const installApp = async () => {
    if (installPrompt) {
      try { await installPrompt.prompt(); setInstallPrompt(null); } catch { setInstallOpen(true); }
    } else setInstallOpen(true);
  };
  const closeInstall = useCallback(() => setInstallOpen(false), []);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);

  if (!activeChat) return null;
  return <div className="app-shell">
    <Sidebar t={t} page={page} chats={chats} activeId={activeChat.id} onSelectChat={selectChat} onNew={newConversation} status={status} />
    <div className="main-area">
      <Topbar t={t} page={page} language={language} setLanguage={setLanguage} status={status} mode={mode} voicePhase={voicePhase} onHistory={() => setHistoryOpen(true)} />
      <main id="main-content">
        {page === 'ask' && <HomePage t={t} chat={activeChat} status={status} mode={mode} groundingByMessage={groundingByMessage} draft={draft} setDraft={setDraft} onSend={sendQuestion} onMic={useMic} voicePhase={voicePhase} pending={pending} inputRef={inputRef} onTry={tryTopic} onNew={newConversation} saved={saved} onSave={toggleSaved} onCopy={copyAnswer} onSpeak={speak} speakingId={speakingId} onRetry={retryQuestion} language={language} endRef={endRef} />}
        {page === 'explore' && <ExplorePage t={t} onTry={tryTopic} resources={resources} resourcesError={resourcesError} onReload={loadResources} />}
        {page === 'saved' && <SavedPage t={t} saved={saved} onSave={toggleSaved} onCopy={copyAnswer} onSpeak={speak} speakingId={speakingId} language={language} groundingByMessage={groundingByMessage} />}
        {page === 'about' && <AboutPage t={t} onInstall={installApp} installed={installed} onClearHistory={clearHistory} onClearSaved={clearSaved} />}
      </main>
    </div>
    <MobileNav t={t} page={page} />
    {toast && <div className="toast" role="status"><Info size={17} /><span>{toast}</span><button type="button" onClick={() => setToast('')} aria-label={t.close}><X size={15} /></button></div>}
    {installOpen && <InstallModal t={t} onClose={closeInstall} />}
    {historyOpen && <HistoryModal t={t} chats={chats} activeId={activeChat.id} onSelect={selectChat} onNew={newConversation} onClose={closeHistory} />}
  </div>;
}
