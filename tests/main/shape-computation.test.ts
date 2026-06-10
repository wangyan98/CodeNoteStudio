import { describe, it, expect } from 'vitest'
import { computeOutputShape } from '../../src/main/utils/shape-computation'

describe('computeOutputShape', () => {
  // --- Conv2d ---
  it('computes Conv2d output with stride=1, no padding', () => {
    const result = computeOutputShape('Conv2d', '3×640×640', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 1, padding: 0
    })
    expect(result).toBe('16×638×638')
  })

  it('computes Conv2d output with stride=2 (YOLOv8 backbone example)', () => {
    const result = computeOutputShape('Conv2d', '3×640×640', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 2, padding: 1
    })
    expect(result).toBe('16×320×320')
  })

  it('computes Conv2d output with dilation', () => {
    const result = computeOutputShape('Conv2d', '64×80×80', {
      in_channels: 64, out_channels: 64, kernel_size: 3, stride: 1, padding: 2, dilation: 2
    })
    expect(result).toBe('64×80×80')
  })

  // --- Conv1d ---
  it('computes Conv1d output', () => {
    const result = computeOutputShape('Conv1d', '16×128', {
      in_channels: 16, out_channels: 32, kernel_size: 3, stride: 1, padding: 0
    })
    expect(result).toBe('32×126')
  })

  // --- ConvTranspose2d ---
  it('computes ConvTranspose2d upsampling', () => {
    const result = computeOutputShape('ConvTranspose2d', '128×20×20', {
      in_channels: 128, out_channels: 64, kernel_size: 2, stride: 2, padding: 0
    })
    expect(result).toBe('64×40×40')
  })

  // --- MaxPool2d ---
  it('computes MaxPool2d with kernel=2 stride=2', () => {
    const result = computeOutputShape('MaxPool2d', '64×160×160', {
      kernel_size: 2, stride: 2, padding: 0
    })
    expect(result).toBe('64×80×80')
  })

  // --- AvgPool2d ---
  it('computes AvgPool2d with padding', () => {
    const result = computeOutputShape('AvgPool2d', '64×80×80', {
      kernel_size: 3, stride: 2, padding: 1
    })
    expect(result).toBe('64×40×40')
  })

  // --- Passthrough layers ---
  it('passes through BatchNorm2d unchanged', () => {
    const result = computeOutputShape('BatchNorm2d', '64×80×80', { num_features: 64 })
    expect(result).toBe('64×80×80')
  })

  it('passes through ReLU unchanged', () => {
    const result = computeOutputShape('ReLU', '64×80×80', { inplace: false })
    expect(result).toBe('64×80×80')
  })

  it('passes through Dropout unchanged', () => {
    const result = computeOutputShape('Dropout', '256×40×40', { p: 0.5 })
    expect(result).toBe('256×40×40')
  })

  it('passes through Identity unchanged', () => {
    const result = computeOutputShape('Identity', '128×20×20', {})
    expect(result).toBe('128×20×20')
  })

  it('passes through GELU unchanged', () => {
    const result = computeOutputShape('GELU', '64×80×80', {})
    expect(result).toBe('64×80×80')
  })

  it('passes through Sigmoid unchanged', () => {
    const result = computeOutputShape('Sigmoid', '64×80×80', {})
    expect(result).toBe('64×80×80')
  })

  it('passes through Softmax unchanged', () => {
    const result = computeOutputShape('Softmax', '64×80×80', { dim: -1 })
    expect(result).toBe('64×80×80')
  })

  // --- Linear ---
  it('computes Linear output from 1D input', () => {
    const result = computeOutputShape('Linear', '512', {
      in_features: 512, out_features: 256
    })
    expect(result).toBe('256')
  })

  // --- LSTM ---
  it('computes LSTM output', () => {
    const result = computeOutputShape('LSTM', '128×64', {
      input_size: 128, hidden_size: 256
    })
    expect(result).toBe('256')
  })

  // --- Embedding ---
  it('computes Embedding output', () => {
    const result = computeOutputShape('Embedding', '1000', {
      num_embeddings: 1000, embedding_dim: 128
    })
    expect(result).toBe('128')
  })

  // --- Upsample (custom, by scale_factor param) ---
  it('computes Upsample with scale_factor=2', () => {
    const result = computeOutputShape('Upsample', '256×40×40', { scale_factor: 2 })
    expect(result).toBe('256×80×80')
  })

  // --- Null cases ---
  it('returns null for unknown layer type', () => {
    const result = computeOutputShape('UnknownLayer', '64×80×80', {})
    expect(result).toBeNull()
  })

  it('returns null for missing required params', () => {
    const result = computeOutputShape('Conv2d', '3×640×640', {})
    expect(result).toBeNull()
  })

  it('returns null for malformed input shape', () => {
    const result = computeOutputShape('Conv2d', 'not-a-shape', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 1
    })
    expect(result).toBeNull()
  })

  it('returns null for empty input shape', () => {
    const result = computeOutputShape('Conv2d', '', {
      in_channels: 3, out_channels: 16, kernel_size: 3, stride: 1
    })
    expect(result).toBeNull()
  })

  // --- LayerNorm (passthrough) ---
  it('passes through LayerNorm unchanged', () => {
    const result = computeOutputShape('LayerNorm', '64×80×80', { normalized_shape: '80' })
    expect(result).toBe('64×80×80')
  })

  // --- Conv3d ---
  it('computes Conv3d output', () => {
    const result = computeOutputShape('Conv3d', '3×16×224×224', {
      in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 1
    })
    expect(result).toBe('64×16×224×224')
  })
})
