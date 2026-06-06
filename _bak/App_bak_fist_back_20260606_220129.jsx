import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Carousel from './components/Carousel'
import Footer from './components/Footer'
import HandTracker from './components/HandTracker'
import MotionPage from './pages/MotionPage'
import './styles/motion-page.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={
        <>
          <HandTracker />
          <Header />
          <main className="main-center">
            <Carousel />
          </main>
          <Footer />
        </>
      } />
      <Route path="/motion/:id" element={<MotionPage />} />
    </Routes>
  )
}
