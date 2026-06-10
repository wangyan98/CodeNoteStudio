/**
 * Computes the output tensor shape for a layer given its input shape and parameters.
 *
 * Shape format: "C×H×W" (2D), "C×L" (1D), "C×D×H×W" (3D), "N" (flat features).
 * Returns null if the shape cannot be computed (missing params, unknown layer, malformed input).
 */

// Layer types that don't change the tensor shape
const PASSTHROUGH_LAYERS = new Set([
  'BatchNorm1d', 'BatchNorm2d', 'BatchNorm3d',
  'LayerNorm', 'InstanceNorm1d', 'InstanceNorm2d', 'InstanceNorm3d',
  'ReLU', 'LeakyReLU', 'GELU', 'Sigmoid', 'Tanh', 'Softmax',
  'Identity', 'Dropout', 'Dropout2d', 'Dropout3d',
])

function parseShape(shape: string): number[] | null {
  if (!shape || !shape.trim()) return null
  const parts = shape.split('×').map(s => {
    const n = Number(s.trim())
    return Number.isFinite(n) ? n : NaN
  })
  if (parts.some(n => Number.isNaN(n))) return null
  return parts
}

function formatShape(parts: number[]): string {
  return parts.join('×')
}

function convOutSize(
  inSize: number,
  kernel: number,
  stride: number,
  padding: number,
  dilation: number
): number {
  return Math.floor((inSize - dilation * (kernel - 1) - 1 + 2 * padding) / stride + 1)
}

function convTransposeOutSize(
  inSize: number,
  kernel: number,
  stride: number,
  padding: number
): number {
  return (inSize - 1) * stride - 2 * padding + kernel
}

export function computeOutputShape(
  layerType: string,
  inputShape: string,
  params: Record<string, unknown>
): string | null {
  const inParts = parseShape(inputShape)
  if (!inParts) return null

  const getNum = (key: string): number | undefined => {
    const v = params[key]
    if (typeof v === 'number') return v
    if (typeof v === 'string') {
      const n = Number(v)
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }

  // Passthrough layers: output shape = input shape
  if (PASSTHROUGH_LAYERS.has(layerType)) {
    return formatShape(inParts)
  }

  switch (layerType) {
    case 'Conv1d': {
      const outCh = getNum('out_channels')
      const k = getNum('kernel_size') ?? 3
      const s = getNum('stride') ?? 1
      const p = getNum('padding') ?? 0
      const d = getNum('dilation') ?? 1
      if (outCh === undefined || inParts.length < 2) return null
      const outL = convOutSize(inParts[inParts.length - 1], k, s, p, d)
      return formatShape([outCh, outL])
    }

    case 'Conv2d':
    case 'ConvTranspose2d': {
      const outCh = getNum('out_channels')
      const k = getNum('kernel_size') ?? 3
      const s = getNum('stride') ?? 1
      const p = getNum('padding') ?? 0
      if (outCh === undefined || inParts.length < 3) return null
      const inH = inParts[1]
      const inW = inParts[2]
      let outH: number, outW: number
      if (layerType === 'ConvTranspose2d') {
        outH = convTransposeOutSize(inH, k, s, p)
        outW = convTransposeOutSize(inW, k, s, p)
      } else {
        const d = getNum('dilation') ?? 1
        outH = convOutSize(inH, k, s, p, d)
        outW = convOutSize(inW, k, s, p, d)
      }
      return formatShape([outCh, outH, outW])
    }

    case 'Conv3d': {
      const outCh = getNum('out_channels')
      const k = getNum('kernel_size') ?? 3
      const s = getNum('stride') ?? 1
      const p = getNum('padding') ?? 0
      const d = getNum('dilation') ?? 1
      if (outCh === undefined || inParts.length < 4) return null
      const inD = inParts[1]
      const inH = inParts[2]
      const inW = inParts[3]
      const outD = convOutSize(inD, k, s, p, d)
      const outH = convOutSize(inH, k, s, p, d)
      const outW = convOutSize(inW, k, s, p, d)
      return formatShape([outCh, outD, outH, outW])
    }

    case 'MaxPool2d':
    case 'AvgPool2d': {
      const k = getNum('kernel_size') ?? 2
      const s = getNum('stride') ?? k
      const p = getNum('padding') ?? 0
      if (inParts.length < 3) return null
      const outH = convOutSize(inParts[1], k, s, p, 1)
      const outW = convOutSize(inParts[2], k, s, p, 1)
      return formatShape([inParts[0], outH, outW])
    }

    case 'Linear': {
      const outFeat = getNum('out_features')
      if (outFeat === undefined) return null
      return formatShape([outFeat])
    }

    case 'LSTM':
    case 'GRU': {
      const hidden = getNum('hidden_size')
      if (hidden === undefined) return null
      return formatShape([hidden])
    }

    case 'Embedding': {
      const embDim = getNum('embedding_dim')
      if (embDim === undefined) return null
      return formatShape([embDim])
    }

    case 'Upsample': {
      const scale = getNum('scale_factor')
      if (scale === undefined) return null
      const outParts = [inParts[0]]
      for (let i = 1; i < inParts.length; i++) {
        outParts.push(inParts[i] * scale)
      }
      return formatShape(outParts)
    }

    default:
      return null
  }
}
