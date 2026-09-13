import { useCallback, useRef, useState } from 'react'
import { analyzeAppam } from './analyzeAppam'

const IDLE = 'idle'
const ANALYZING = 'analyzing'
const DONE = 'done'
const ERROR = 'error'

export default function App() {
  const [status, setStatus] = useState(IDLE)
  const [imageSrc, setImageSrc] = useState(null)
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef(null)

  const runAnalysis = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) {
      setStatus(ERROR)
      setErrorMsg('That does not look like an image. Appams are shy around other file types.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const src = e.target.result
      setImageSrc(src)
      setStatus(ANALYZING)

      const img = new Image()
      img.onload = () => {
        // Tiny delay so the "analyzing" state is visible — instant results
        // feel like the app didn't try hard enough.
        setTimeout(() => {
          const outcome = analyzeAppam(img)
          if (outcome.ok) {
            setResult(outcome)
            setStatus(DONE)
          } else {
            setErrorMsg(outcome.reason)
            setStatus(ERROR)
          }
        }, 550)
      }
      img.onerror = () => {
        setErrorMsg('The image refused to load. Even the appam has trust issues.')
        setStatus(ERROR)
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }, [])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    runAnalysis(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    runAnalysis(file)
  }

  const reset = () => {
    setStatus(IDLE)
    setImageSrc(null)
    setResult(null)
    setErrorMsg('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow-free-label">Kerala's finest, scientifically judged</p>
        <h1>Appam Roundness Analyzer</h1>
        <p className="tagline">
          Upload a photo of your appam. We'll pretend to measure its geometry with the
          seriousness of a Michelin inspector.
        </p>
      </header>

      <main className="panel">
        {status !== DONE && (
          <div
            className={`dropzone ${dragOver ? 'drag-over' : ''} ${status === ANALYZING ? 'analyzing' : ''}`}
            onClick={() => status !== ANALYZING && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
          >
            {imageSrc ? (
              <img src={imageSrc} alt="Uploaded appam" className="dropzone-image" />
            ) : (
              <div className="dropzone-placeholder">
                <span className="dropzone-icon">🥞</span>
                <span className="dropzone-text">Tap or drop your appam photo here</span>
                <span className="dropzone-subtext">Top-down shot, contrasting plate = best results</span>
              </div>
            )}

            {status === ANALYZING && (
              <div className="analyzing-overlay">
                <div className="spinner" />
                <span>Measuring roundness with a virtual protractor…</span>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden-input"
            />
          </div>
        )}

        {status === ERROR && (
          <div className="error-box">
            <p>⚠️ {errorMsg}</p>
            <button className="secondary-btn" onClick={reset}>Try again</button>
          </div>
        )}

        {status === DONE && result && (
          <ResultsCard imageSrc={imageSrc} result={result} onReset={reset} />
        )}
      </main>

      <footer className="footer">
        <p>Built for fun. No appams were harmed, only judged. 🍳</p>
      </footer>
    </div>
  )
}

function StatRow({ label, value }) {
  return (
    <div className="stat-row">
      <div className="stat-row-top">
        <span>{label}</span>
        <span className="stat-value">{value}%</span>
      </div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    </div>
  )
}

function MeasurementRow({ label, value, detail }) {
  return (
    <div className="measurement-row">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function ResultsCard({ imageSrc, result, onReset }) {
  const { roundness, symmetry, holes, thickness, grade, label, comment, uselessness } = result

  return (
    <div className="results-card">
      <div className="results-top">
        <img src={imageSrc} alt="Analyzed appam" className="results-thumb" />
        <div className="grade-stamp">
          <span className="grade-letter">{grade}</span>
          <span className="grade-label">{label}</span>
        </div>
      </div>

      <StatRow label="Roundness" value={roundness} />
      <StatRow label="Symmetry" value={symmetry} />

      <div className="measurements" aria-label="Appam measurements">
        <MeasurementRow label="Holes detected" value={holes} detail="visible openings" />
        <MeasurementRow label="Visual thickness" value={`${thickness} px`} detail="estimated from image" />
      </div>

      <div className="stat-row">
        <div className="stat-row-top">
          <span>Uselessness Score</span>
          <span className="stat-value">{uselessness}% 😂</span>
        </div>
        <div className="bar-track">
          <div className="bar-fill uselessness-fill" style={{ width: `${uselessness}%` }} />
        </div>
      </div>

      <blockquote className="ai-comment">"{comment}"</blockquote>

      <button className="primary-btn" onClick={onReset}>
        Analyze Another Appam 🍳
      </button>
    </div>
  )
}
