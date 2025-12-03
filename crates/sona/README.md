# SONA - Self-Optimizing Neural Architecture

A lightweight adaptive learning system with ReasoningBank integration, designed for real-time neural network optimization with WASM support.

## 🚀 Features

- **Micro-LoRA**: Ultra-low rank (1-2) LoRA for instant learning with minimal overhead
- **Base-LoRA**: Standard LoRA for background learning and consolidation
- **EWC++**: Elastic Weight Consolidation to prevent catastrophic forgetting
- **ReasoningBank**: Pattern extraction and similarity search using learned patterns
- **Three Learning Loops**:
  - **Instant Loop**: Sub-millisecond micro-LoRA updates
  - **Background Loop**: Periodic pattern extraction and base-LoRA training
  - **Coordination Loop**: Cross-loop synchronization and optimization
- **WASM Support**: Run in browsers and edge devices with full functionality

## 📦 Installation

### Rust
```toml
[dependencies]
sona = "0.1"
```

### WASM (npm/browser)
```bash
cd crates/sona
wasm-pack build --target web --features wasm
```

## 🎯 Quick Start

### Rust Example

```rust
use sona::{SonaEngine, SonaConfig};

fn main() {
    // Create engine with configuration
    let engine = SonaEngine::new(SonaConfig {
        hidden_dim: 256,
        embedding_dim: 256,
        micro_lora_rank: 2,
        base_lora_rank: 16,
        ..Default::default()
    });

    // Start trajectory
    let mut builder = engine.begin_trajectory(vec![0.1; 256]);
    builder.add_step(vec![0.5; 256], vec![], 0.8);
    
    // End trajectory
    engine.end_trajectory(builder, 0.85);

    // Apply LoRA transformation
    let input = vec![1.0; 256];
    let mut output = vec![0.0; 256];
    engine.apply_micro_lora(&input, &mut output);
}
```

## 🔧 Building

### WASM
```bash
cd crates/sona
wasm-pack build --target web --features wasm

# Run example
cd wasm-example
npm run dev
# Open http://localhost:8080
```

## 📄 License

Licensed under MIT OR Apache-2.0
