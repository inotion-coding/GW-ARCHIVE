import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Carousel from './components/Carousel'
import FileViewer from './components/FileViewer'
import Footer from './components/Footer'
import HandTracker from './components/HandTracker'
import MotionPage from './pages/MotionPage'
import TimerPage from './pages/TimerPage'
import FileViewerPage from './pages/FileViewerPage'
import CalendarPage from './pages/CalendarPage'
import SchedulePage from './pages/SchedulePage'
import CalendarView from './components/CalendarView'
import './styles/motion-page.css'

export default function App() {
  return (
    <>
      <HandTracker />
      <Routes>
        <Route path="/" element={
          <>
            <FileViewer />
            <CalendarView />
            <Header />
            <main className="main-center">
              <Carousel />
            </main>
            <Footer />
          </>
        } />
        <Route path="/motion/2"   element={<SchedulePage />} />
        <Route path="/motion/3"   element={<CalendarPage />} />
        <Route path="/motion/5"   element={<TimerPage />} />
        <Route path="/motion/10"  element={<FileViewerPage />} />
        <Route path="/motion/:id" element={<MotionPage />} />
      </Routes>
    </>
  )
}
