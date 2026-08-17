import {
  Home,
  User,
  CheckSquare,
  Folder,
  Calendar,
  List,
  Activity,
  FileText,
  Briefcase,
  Users,
  Share2,
  DownloadCloud,
  Settings,
  BarChart2,
} from 'react-feather'

// Names from lib/nav.js → the components that draw them. The split keeps that
// module free of the view layer; nav.test.js asserts every destination has an
// entry here, so the two can't drift apart silently.
export const NAV_ICONS = {
  Home,
  User,
  CheckSquare,
  Folder,
  Calendar,
  List,
  Activity,
  FileText,
  Briefcase,
  Users,
  Share2,
  DownloadCloud,
  Settings,
  BarChart2,
}

export default NAV_ICONS
