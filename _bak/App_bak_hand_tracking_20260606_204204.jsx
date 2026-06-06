import Header from './components/Header'
import Carousel from './components/Carousel'
import Footer from './components/Footer'

export default function App() {
  return (
    <>
      <Header />
      <main className="main-center">
        <Carousel />
      </main>
      <Footer />
    </>
  )
}
