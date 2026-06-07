import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Carousel from './components/Carousel'
import CalendarView from './components/CalendarView'
import FileViewer from './components/FileViewer'
import Footer from './components/Footer'
import HandTracker from './components/HandTracker'
import MotionPage from './pages/MotionPage'
import TimerPage from './pages/TimerPage'
import FileViewerPage from './pages/FileViewerPage'
import './styles/motion-page.css'

export default function App() {
  return (
    <>
      {/* HandTracker는 전체 앱에서 항상 활성 — 페이지 이동 후에도 제스처 인식 유지 */}
      <HandTracker />
      <Routes>
        <Route path="/" element={
          <>
            <CalendarView />
            <FileViewer />
            <Header />
            <main className="main-center">
              <Carousel />
            </main>
            <Footer />
          </>
        } />
        <Route path="/motion/5"   element={<TimerPage />} />
        <Route path="/motion/10"  element={<FileViewerPage />} />
        <Route path="/motion/:id" element={<MotionPage />} />
      </Routes>
    </>
  )
}
