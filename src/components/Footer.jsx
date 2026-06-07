import { useState, useEffect, useRef } from 'react'
import handState from '../utils/handState'

export default function Footer() {
  const [leftLocked,   setLeftLocked]   = useState(() => handState.leftLocked)
  const [rightLocked,  setRightLocked]  = useState(() => handState.rightLocked)
  const [leftProgress, setLeftProgress] = useState(0)
  const [rightProgress,setRightProgress]= useState(0)
  const [leftFlash,    setLeftFlash]    = useState(null)
  const [rightFlash,   setRightFlash]   = useState(null)
  const [dismissed,    setDismissed]    = useState(false)

  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    const timer = setInterval(() => {
      if (!mountedRef.current) return
      setDismissed(handState.dismissed)
      setLeftLocked(handState.leftLocked)
      setRightLocked(handState.rightLocked)
      setLeftProgress(handState.leftLockProgress)
      setRightProgress(handState.rightLockProgress)

      if (handState.leftLockFlash) {
        const f = handState.leftLockFlash
        handState.leftLockFlash = null
        setLeftFlash(f)
        setTimeout(() => { if (mountedRef.current) setLeftFlash(null) }, 1600)
      }
      if (handState.rightLockFlash) {
        const f = handState.rightLockFlash
        handState.rightLockFlash = null
        setRightFlash(f)
        setTimeout(() => { if (mountedRef.current) setRightFlash(null) }, 1600)
      }
    }, 80)

    return () => {
      mountedRef.current = false
      clearInterval(timer)
    }
  }, [])

  return (
    <footer>
      <div className={`lock-status${dismissed ? ' lock-status--hidden' : ''}`}>
        <LockItem label="Left"  locked={leftLocked}  progress={leftProgress}  flash={leftFlash}  />
        <div className="lock-sep" />
        <LockItem label="Right" locked={rightLocked} progress={rightProgress} flash={rightFlash} />
      </div>
    </footer>
  )
}

function LockItem({ label, locked, progress, flash }) {
  const showGauge = progress > 0.01 || flash !== null
  const fillPct   = flash !== null ? 100 : Math.round(progress * 100)

  return (
    <div className={`lock-item${flash ? ` item-flash-${flash}` : ''}`}>
      <span className="lock-hand">{label}</span>
      <span className={`lock-state${locked ? '' : ' lock-active'}`}>
        {locked ? 'Locked' : 'Unlocked'}
      </span>
      <div className={`lock-gauge-wrap${showGauge ? ' gauge-active' : ''}${flash ? ` gauge-flash-${flash}` : ''}`}>
        <div className="lock-gauge-fill" style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  )
}
