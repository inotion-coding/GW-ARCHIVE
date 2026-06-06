import { useState, useEffect } from 'react'
import handState from '../utils/handState'

export default function Footer() {
  const [leftLocked,  setLeftLocked]  = useState(true)
  const [rightLocked, setRightLocked] = useState(true)

  useEffect(() => {
    let rafId
    let prevL = handState.leftLocked
    let prevR = handState.rightLocked
    function poll() {
      if (handState.leftLocked  !== prevL) { prevL = handState.leftLocked;  setLeftLocked(prevL)  }
      if (handState.rightLocked !== prevR) { prevR = handState.rightLocked; setRightLocked(prevR) }
      rafId = requestAnimationFrame(poll)
    }
    rafId = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <footer>
      <div className="lock-status">
        <LockItem label="Left"  locked={leftLocked}  />
        <div className="lock-sep" />
        <LockItem label="Right" locked={rightLocked} />
      </div>
    </footer>
  )
}

function LockItem({ label, locked }) {
  return (
    <div className="lock-item">
      <span className="lock-hand">{label}</span>
      <span className={`lock-state${locked ? '' : ' lock-active'}`}>
        {locked ? 'Locked' : 'Unlocked'}
      </span>
    </div>
  )
}
