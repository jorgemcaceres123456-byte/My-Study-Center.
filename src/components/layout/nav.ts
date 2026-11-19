import { LayoutDashboard, BookOpenCheck, Images, LibraryBig, Bot, CalendarDays, Timer, Flame, Settings2, type LucideIcon } from 'lucide-react';
import type { SectionId } from '../../types';

export interface NavItem { id: SectionId; label: string; icon: LucideIcon; hint: string }
export const NAV: NavItem[] = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard, hint: 'Tu progreso de un vistazo' },
  { id: 'subjects', label: 'Materias y tareas', icon: BookOpenCheck, hint: 'Organiza el avance por materia' },
  { id: 'library', label: 'Fotos y apuntes', icon: Images, hint: 'Sube páginas del cuaderno' },
  { id: 'biblioteca', label: 'Biblioteca', icon: LibraryBig, hint: 'Todo lo enviado a la IA' },
  { id: 'chat', label: 'Chat de IA', icon: Bot, hint: 'Guías, métodos y recursos' },
  { id: 'sessions', label: 'Sesiones y racha', icon: Timer, hint: 'Registro real de estudio' },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays, hint: 'Entregas y recordatorios' },
  { id: 'habits', label: 'Hábitos', icon: Flame, hint: 'Crea tus propios hábitos' },
  { id: 'settings', label: 'Ajustes', icon: Settings2, hint: 'IA, voz, datos y notificaciones' },
];
export const MOBILE_PRIMARY: SectionId[] = ['dashboard', 'subjects', 'chat', 'sessions', 'calendar'];
