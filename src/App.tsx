import { useEffect, useState } from 'react';
import { AmbientBackground } from './components/layout/AmbientBackground';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import { MobileNav, MobileDrawer } from './components/layout/MobileNav';
import { Dashboard } from './features/dashboard/Dashboard';
import { Subjects } from './features/subjects/Subjects';
import { Library } from './features/library/Library';
import { Biblioteca } from './features/biblioteca/Biblioteca';
import { Sessions } from './features/sessions/Sessions';
import { Chat } from './features/chat/Chat';
import { Exercises } from './features/exercises/Exercises';
import { Calendar } from './features/calendar/Calendar';
import { Habits } from './features/habits/Habits';
import { Settings } from './features/settings/Settings';
import { useStore } from './state/store';
import { useReminders } from './lib/reminders';
import type { SectionId } from './types';

const SECTION_KEY = 'my-study-center:section';
const VALID: SectionId[] = ['dashboard', 'subjects', 'library', 'biblioteca', 'chat', 'exercises', 'sessions', 'calendar', 'habits', 'settings'];

export default function App() {
  const { state } = useStore();
  const [section, setSection] = useState<SectionId>(() => {
    const saved = localStorage.getItem(SECTION_KEY) as SectionId | null;
    return saved && VALID.includes(saved) ? saved : 'dashboard';
  });
  const [drawer, setDrawer] = useState(false);
  useReminders();

  useEffect(() => {
    const fn = () => setDrawer(true);
    window.addEventListener('msc:drawer', fn);
    return () => window.removeEventListener('msc:drawer', fn);
  }, []);

  const navigate = (s: SectionId) => {
    setSection(s);
    localStorage.setItem(SECTION_KEY, s);
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`app app--${state.accent}`}>
      <AmbientBackground />
      <Sidebar section={section} onNavigate={navigate} />
      <div className="app__main">
        <Topbar section={section} onNavigate={navigate} onOpenDrawer={() => setDrawer(true)} />
        <main className="content" key={section}>
          {section === 'dashboard' && <Dashboard onNavigate={navigate} />}
          {section === 'subjects' && <Subjects onNavigate={navigate} />}
          {section === 'library' && <Library onNavigate={navigate} />}
          {section === 'biblioteca' && <Biblioteca onNavigate={navigate} />}
          {section === 'chat' && <Chat onNavigate={navigate} />}
          {section === 'exercises' && <Exercises onNavigate={navigate} />}
          {section === 'sessions' && <Sessions />}
          {section === 'calendar' && <Calendar />}
          {section === 'habits' && <Habits />}
          {section === 'settings' && <Settings />}
          <footer className="app-footer"><span>My Study Center · Cristal líquido para estudiar mejor</span><span>Datos en tu navegador · Sin servidor · Hecho para enfocarte ✨</span></footer>
        </main>
      </div>
      <MobileNav section={section} onNavigate={navigate} />
      <MobileDrawer open={drawer} onClose={() => setDrawer(false)} section={section} onNavigate={navigate} />
    </div>
  );
}
