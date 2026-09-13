// Lightweight, dependency-free "appam vision" pipeline.
// It's real image processing (grayscale -> Otsu threshold -> mask ->
// geometry), just aimed at a silly goal. No ML model, no backend.

const MAX_DIM = 320 // downscale for speed; plenty of resolution for shape math

function loadImageToCanvas(imgEl) {
  const scale = Math.min(1, MAX_DIM / Math.max(imgEl.naturalWidth, imgEl.naturalHeight))
  const w = Math.max(1, Math.round(imgEl.naturalWidth * scale))
  const h = Math.max(1, Math.round(imgEl.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(imgEl, 0, 0, w, h)
  return { canvas, ctx, w, h }
}

function toGrayscale(imageData) {
  const { data, width, height } = imageData
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b
  }
  return gray
}

// Classic Otsu's method: finds the threshold that best splits the image
// into two brightness clusters (appam vs. background/plate/table).
function otsuThreshold(gray) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const total = gray.length

  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]

  let sumB = 0, wB = 0, wF = 0, maxVar = 0, threshold = 127

  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    wF = total - wB
    if (wF === 0) break

    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)

    if (between > maxVar) {
      maxVar = between
      threshold = t
    }
  }
  return threshold
}

function buildMask(gray, w, h, threshold) {
  // Decide which side of the threshold is the "object" by checking which
  // class the four corners belong to (assume corners are background).
  const isDark = (v) => v < threshold
  const corners = [0, w - 1, w * (h - 1), w * h - 1].map((idx) => isDark(gray[idx]))
  const darkCorners = corners.filter(Boolean).length
  const backgroundIsDark = darkCorners >= 2 // majority vote

  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const dark = isDark(gray[i])
    mask[i] = dark === backgroundIsDark ? 0 : 1 // 1 = appam (foreground)
  }
  return mask
}

// Keep only the largest connected blob so stray crumbs/plate patterns
// don't wreck the geometry. Simple flood fill (BFS) on a small image.
function largestBlob(mask, w, h) {
  const visited = new Uint8Array(w * h)
  let best = null
  let bestSize = 0

  for (let start = 0; start < w * h; start++) {
    if (mask[start] !== 1 || visited[start]) continue

    const stack = [start]
    visited[start] = 1
    const pixels = []

    while (stack.length) {
      const idx = stack.pop()
      pixels.push(idx)
      const x = idx % w
      const y = Math.floor(idx / w)
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
      ]
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const nIdx = ny * w + nx
        if (mask[nIdx] === 1 && !visited[nIdx]) {
          visited[nIdx] = 1
          stack.push(nIdx)
        }
      }
    }

    if (pixels.length > bestSize) {
      bestSize = pixels.length
      best = pixels
    }
  }

  const cleanMask = new Uint8Array(w * h)
  if (best) for (const idx of best) cleanMask[idx] = 1
  return { mask: cleanMask, size: bestSize }
}

function computeGeometry(mask, w, h) {
  let minX = w, maxX = -1, minY = h, maxY = -1
  let sumX = 0, sumY = 0, area = 0

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue
      area++
      sumX += x
      sumY += y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  if (area === 0) return null

  const cx = sumX / area
  const cy = sumY / area
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1

  return { area, cx, cy, minX, maxX, minY, maxY, bw, bh }
}

function computeSymmetry(mask, w, h, geo) {
  const { cx, cy, minX, maxX, minY, maxY } = geo

  // Mirror across the vertical axis through the centroid.
  let vMatch = 0, vTotal = 0
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const mirroredX = Math.round(2 * cx - x)
      if (mirroredX < 0 || mirroredX >= w) continue
      const a = mask[y * w + x]
      const b = mask[y * w + mirroredX]
      if (a === 1 || b === 1) {
        vTotal++
        if (a === b) vMatch++
      }
    }
  }

  // Mirror across the horizontal axis through the centroid.
  let hMatch = 0, hTotal = 0
  for (let y = minY; y <= maxY; y++) {
    const mirroredY = Math.round(2 * cy - y)
    if (mirroredY < 0 || mirroredY >= h) continue
    for (let x = minX; x <= maxX; x++) {
      const a = mask[y * w + x]
      const b = mask[mirroredY * w + x]
      if (a === 1 || b === 1) {
        hTotal++
        if (a === b) hMatch++
      }
    }
  }

  const vScore = vTotal > 0 ? vMatch / vTotal : 0
  const hScore = hTotal > 0 ? hMatch / hTotal : 0
  return ((vScore + hScore) / 2) * 100
}

function computeRoundness(geo) {
  const { area, bw, bh } = geo
  const aspect = Math.min(bw, bh) / Math.max(bw, bh) // 1 = square bbox (good for a circle)
  const idealFillRatio = Math.PI / 4 // a circle fills ~78.5% of its bounding square
  const fillRatio = area / (bw * bh)
  const fillScore = Math.min(1, fillRatio / idealFillRatio)
  const roundness = (aspect * 0.5 + fillScore * 0.5) * 100
  return Math.max(0, Math.min(100, roundness))
}

function countHoles(mask, w, h, geo, appamSize) {
  const visited = new Uint8Array(w * h)
  let holes = 0

  for (let y = geo.minY + 1; y < geo.maxY; y++) {
    for (let x = geo.minX + 1; x < geo.maxX; x++) {
      const start = y * w + x
      if (mask[start] === 1 || visited[start]) continue

      const stack = [start]
      visited[start] = 1
      let size = 0
      let touchesBounds = false

      while (stack.length) {
        const idx = stack.pop()
        const holeX = idx % w
        const holeY = Math.floor(idx / w)
        size++
        if (holeX <= geo.minX || holeX >= geo.maxX || holeY <= geo.minY || holeY >= geo.maxY) {
          touchesBounds = true
        }

        const neighbors = [
          [holeX - 1, holeY], [holeX + 1, holeY], [holeX, holeY - 1], [holeX, holeY + 1],
        ]
        for (const [nx, ny] of neighbors) {
          if (nx < geo.minX || ny < geo.minY || nx > geo.maxX || ny > geo.maxY) continue
          const neighbor = ny * w + nx
          if (mask[neighbor] === 0 && !visited[neighbor]) {
            visited[neighbor] = 1
            stack.push(neighbor)
          }
        }
      }

      if (!touchesBounds && size >= 3 && size <= appamSize * 0.2) holes++
    }
  }

  return holes
}

function estimateThickness(mask, w, h, geo) {
  let boundaryDistanceTotal = 0
  let boundaryPixels = 0

  for (let y = geo.minY; y <= geo.maxY; y++) {
    for (let x = geo.minX; x <= geo.maxX; x++) {
      const idx = y * w + x
      if (mask[idx] !== 1) continue

      let distance = 1
      while (distance < 30) {
        const edge = [
          [x - distance, y], [x + distance, y],
          [x, y - distance], [x, y + distance],
        ]
        if (edge.some(([nx, ny]) => (
          nx < 0 || ny < 0 || nx >= w || ny >= h || mask[ny * w + nx] === 0
        ))) break
        distance++
      }
      boundaryDistanceTotal += distance
      boundaryPixels++
    }
  }

  if (boundaryPixels === 0) return 0
  return Math.max(1, Math.round(boundaryDistanceTotal / boundaryPixels))
}

function gradeFor(score) {
  if (score >= 95) return { grade: 'A+', label: 'Platonic Appam' }
  if (score >= 88) return { grade: 'A', label: 'Instagram-Ready Appam' }
  if (score >= 78) return { grade: 'B', label: 'Respectable Appam' }
  if (score >= 65) return { grade: 'C', label: 'Rustic Appam' }
  if (score >= 50) return { grade: 'D', label: 'Abstract Art Appam' }
  return { grade: 'F', label: 'Modern Sculpture (formerly Appam)' }
}

const COMMENTS = {
  high: [
    "Geometry teachers are weeping tears of joy.",
    "This appam clearly practiced in front of a mirror.",
    "NASA called — they want this for their next satellite dish.",
    "Suspiciously round. Did you use a protractor and a prayer?",
  ],
  mid: [
    "Solid effort. A few edges disagreed with the plan.",
    "Roundish. Round-adjacent. Round-curious.",
    "Gives 'I tried my best at 6 AM' energy.",
    "One side is clearly more confident than the other.",
  ],
  low: [
    "This appam has chosen chaos.",
    "Picasso would frame this. A chef would apologize for it.",
    "It's not a shape, it's a vibe.",
    "The batter escaped and we respect its freedom.",
  ],
}

function commentFor(score) {
  const bucket = score >= 78 ? 'high' : score >= 50 ? 'mid' : 'low'
  const list = COMMENTS[bucket]
  return list[Math.floor(Math.random() * list.length)]
}

/**
 * Analyze an <img> element and return roundness / symmetry / grade / etc.
 * Everything happens on-device with <canvas> — no uploads, no servers,
 * no actual food safety inspectors.
 */
export function analyzeAppam(imgEl) {
  const { ctx, w, h } = loadImageToCanvas(imgEl)
  const imageData = ctx.getImageData(0, 0, w, h)

  const gray = toGrayscale(imageData)
  const threshold = otsuThreshold(gray)
  const rawMask = buildMask(gray, w, h, threshold)
  const { mask, size } = largestBlob(rawMask, w, h)

  if (size < 25) {
    // Not enough of a blob to say anything meaningful.
    return {
      ok: false,
      reason: "Couldn't find a confident appam-shaped blob in that photo. Try a clearer, top-down shot on a contrasting plate!",
    }
  }

  const geo = computeGeometry(mask, w, h)
  const roundness = computeRoundness(geo)
  const symmetry = computeSymmetry(mask, w, h, geo)
  const holes = countHoles(mask, w, h, geo, geo.area)
  const thickness = estimateThickness(mask, w, h, geo)
  const overall = (roundness + symmetry) / 2
  const { grade, label } = gradeFor(overall)
  const comment = commentFor(overall)

  return {
    ok: true,
    roundness: Math.round(roundness * 10) / 10,
    symmetry: Math.round(symmetry * 10) / 10,
    holes,
    thickness,
    overall: Math.round(overall * 10) / 10,
    grade,
    label,
    comment,
    uselessness: 100,
  }
}
