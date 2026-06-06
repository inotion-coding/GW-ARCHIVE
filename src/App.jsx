import Header from './components/Header'
import Carousel from './components/Carousel'
import Footer from './components/Footer'
import HandTracker from './components/HandTracker'

export default function App() {
  return (
    <>
      <HandTracker />
      <Header />
      <main className="main-center">
        <Carousel />
      </main>
      <Footer />
    </>
  )
}
