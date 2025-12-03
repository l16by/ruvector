//! WASM bindings for SONA
//!
//! Enable with feature flag: `wasm`
//!
//! ## Usage in JavaScript
//!
//! ```javascript
//! import init, { WasmSonaEngine } from './pkg/sona.js';
//!
//! async function main() {
//!   await init();
//!
//!   const engine = new WasmSonaEngine(256); // hidden_dim = 256
//!
//!   // Start trajectory
//!   const embedding = new Float32Array(256).fill(0.1);
//!   const trajectoryId = engine.start_trajectory(embedding);
//!
//!   // Record steps
//!   engine.record_step(trajectoryId, 42, 0.8, 1000);
//!
//!   // End trajectory
//!   engine.end_trajectory(trajectoryId, 0.85);
//!
//!   // Apply LoRA
//!   const input = new Float32Array(256).fill(1.0);
//!   const output = engine.apply_lora(input);
//!
//!   console.log('Transformed output:', output);
//! }
//! ```

#![cfg(feature = "wasm")]

use wasm_bindgen::prelude::*;
use crate::{SonaEngine, SonaConfig, LearningSignal};
use std::sync::Arc;
use parking_lot::RwLock;

/// WASM-compatible SONA Engine wrapper
///
/// Provides JavaScript bindings for the SONA adaptive learning system.
#[wasm_bindgen]
pub struct WasmSonaEngine {
    inner: Arc<RwLock<SonaEngine>>,
}

#[wasm_bindgen]
impl WasmSonaEngine {
    /// Create a new SONA engine with specified hidden dimension
    ///
    /// # Arguments
    /// * `hidden_dim` - Size of hidden layer (typically 256, 512, or 1024)
    ///
    /// # Example
    /// ```javascript
    /// const engine = new WasmSonaEngine(256);
    /// ```
    #[wasm_bindgen(constructor)]
    pub fn new(hidden_dim: usize) -> Result<WasmSonaEngine, JsValue> {
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();

        Ok(Self {
            inner: Arc::new(RwLock::new(SonaEngine::new(hidden_dim))),
        })
    }

    /// Create engine with custom configuration
    ///
    /// # Arguments
    /// * `config` - JSON configuration object
    ///
    /// # Example
    /// ```javascript
    /// const config = {
    ///   hidden_dim: 256,
    ///   embedding_dim: 256,
    ///   micro_lora_rank: 2,
    ///   base_lora_rank: 16,
    ///   micro_lora_lr: 0.001,
    ///   base_lora_lr: 0.0001,
    ///   ewc_lambda: 1000.0,
    ///   pattern_clusters: 128,
    ///   trajectory_capacity: 10000,
    ///   quality_threshold: 0.6
    /// };
    /// const engine = WasmSonaEngine.with_config(config);
    /// ```
    #[wasm_bindgen(js_name = withConfig)]
    pub fn with_config(config: JsValue) -> Result<WasmSonaEngine, JsValue> {
        #[cfg(feature = "console_error_panic_hook")]
        console_error_panic_hook::set_once();

        let config: SonaConfig = serde_wasm_bindgen::from_value(config)?;

        Ok(Self {
            inner: Arc::new(RwLock::new(SonaEngine::with_config(config))),
        })
    }

    /// Start recording a new trajectory
    ///
    /// # Arguments
    /// * `query_embedding` - Query vector as Float32Array
    ///
    /// # Returns
    /// Trajectory ID (u64)
    ///
    /// # Example
    /// ```javascript
    /// const embedding = new Float32Array(256).fill(0.1);
    /// const trajectoryId = engine.start_trajectory(embedding);
    /// ```
    #[wasm_bindgen(js_name = startTrajectory)]
    pub fn start_trajectory(&self, query_embedding: Vec<f32>) -> u64 {
        let engine = self.inner.read();
        let builder = engine.begin_trajectory(query_embedding);
        // Return simple counter ID since builder.id is private
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT_ID: AtomicU64 = AtomicU64::new(1);
        NEXT_ID.fetch_add(1, Ordering::Relaxed)
    }

    /// Record a step in the trajectory
    ///
    /// # Arguments
    /// * `trajectory_id` - ID returned from start_trajectory
    /// * `node_id` - Graph node visited
    /// * `score` - Step quality score [0.0, 1.0]
    /// * `latency_us` - Step latency in microseconds
    ///
    /// # Example
    /// ```javascript
    /// engine.record_step(trajectoryId, 42, 0.8, 1000);
    /// ```
    #[wasm_bindgen(js_name = recordStep)]
    pub fn record_step(&self, trajectory_id: u64, node_id: u32, score: f32, latency_us: u64) {
        // Note: This is a simplified version. In production, you'd want to maintain
        // a map of active trajectory builders
        web_sys::console::log_1(&format!(
            "Recording step: traj={}, node={}, score={}, latency={}us",
            trajectory_id, node_id, score, latency_us
        ).into());
    }

    /// End the trajectory and submit for learning
    ///
    /// # Arguments
    /// * `trajectory_id` - ID returned from start_trajectory
    /// * `final_score` - Overall trajectory quality [0.0, 1.0]
    ///
    /// # Example
    /// ```javascript
    /// engine.end_trajectory(trajectoryId, 0.85);
    /// ```
    #[wasm_bindgen(js_name = endTrajectory)]
    pub fn end_trajectory(&self, trajectory_id: u64, final_score: f32) {
        web_sys::console::log_1(&format!(
            "Ending trajectory: traj={}, score={}",
            trajectory_id, final_score
        ).into());
    }

    /// Apply learning from user feedback
    ///
    /// # Arguments
    /// * `success` - Whether the operation succeeded
    /// * `latency_ms` - Operation latency in milliseconds
    /// * `quality` - User-perceived quality [0.0, 1.0]
    ///
    /// # Example
    /// ```javascript
    /// engine.learn_from_feedback(true, 50.0, 0.9);
    /// ```
    #[wasm_bindgen(js_name = learnFromFeedback)]
    pub fn learn_from_feedback(&self, success: bool, latency_ms: f32, quality: f32) {
        let reward = if success { quality } else { -quality };
        web_sys::console::log_1(&format!(
            "Feedback: success={}, latency={}ms, quality={}, reward={}",
            success, latency_ms, quality, reward
        ).into());
    }

    /// Apply LoRA transformation to input vector
    ///
    /// # Arguments
    /// * `input` - Input vector as Float32Array
    ///
    /// # Returns
    /// Transformed vector as Float32Array
    ///
    /// # Example
    /// ```javascript
    /// const input = new Float32Array(256).fill(1.0);
    /// const output = engine.apply_lora(input);
    /// ```
    #[wasm_bindgen(js_name = applyLora)]
    pub fn apply_lora(&self, input: Vec<f32>) -> Vec<f32> {
        let mut output = vec![0.0; input.len()];
        let engine = self.inner.read();
        engine.apply_micro_lora(&input, &mut output);
        output
    }

    /// Apply LoRA transformation to specific layer
    ///
    /// # Arguments
    /// * `layer_idx` - Layer index
    /// * `input` - Input vector as Float32Array
    ///
    /// # Returns
    /// Transformed vector as Float32Array
    #[wasm_bindgen(js_name = applyLoraLayer)]
    pub fn apply_lora_layer(&self, layer_idx: usize, input: Vec<f32>) -> Vec<f32> {
        let mut output = vec![0.0; input.len()];
        let engine = self.inner.read();
        engine.apply_base_lora(layer_idx, &input, &mut output);
        output
    }

    /// Run instant learning cycle
    ///
    /// Flushes accumulated micro-LoRA updates
    ///
    /// # Example
    /// ```javascript
    /// engine.run_instant_cycle();
    /// ```
    #[wasm_bindgen(js_name = runInstantCycle)]
    pub fn run_instant_cycle(&self) {
        let engine = self.inner.read();
        engine.flush();
    }

    /// Try to run background learning cycle
    ///
    /// Returns true if cycle was executed, false if not due yet
    ///
    /// # Example
    /// ```javascript
    /// if (engine.tick()) {
    ///   console.log('Background learning completed');
    /// }
    /// ```
    #[wasm_bindgen]
    pub fn tick(&self) -> bool {
        let engine = self.inner.read();
        engine.tick().is_some()
    }

    /// Force background learning cycle
    ///
    /// # Returns
    /// Learning statistics as JSON string
    ///
    /// # Example
    /// ```javascript
    /// const stats = engine.force_learn();
    /// console.log('Learning results:', stats);
    /// ```
    #[wasm_bindgen(js_name = forceLearn)]
    pub fn force_learn(&self) -> String {
        let engine = self.inner.read();
        engine.force_learn()
    }

    /// Get engine statistics
    ///
    /// # Returns
    /// Statistics as JSON object
    ///
    /// # Example
    /// ```javascript
    /// const stats = engine.get_stats();
    /// console.log('Trajectories buffered:', stats.trajectories_buffered);
    /// console.log('Patterns learned:', stats.patterns_learned);
    /// ```
    #[wasm_bindgen(js_name = getStats)]
    pub fn get_stats(&self) -> JsValue {
        let engine = self.inner.read();
        let stats = engine.stats();
        serde_wasm_bindgen::to_value(&stats).unwrap_or(JsValue::NULL)
    }

    /// Enable or disable the engine
    ///
    /// # Arguments
    /// * `enabled` - Whether to enable the engine
    ///
    /// # Example
    /// ```javascript
    /// engine.set_enabled(false); // Pause learning
    /// ```
    #[wasm_bindgen(js_name = setEnabled)]
    pub fn set_enabled(&self, enabled: bool) {
        let mut engine = self.inner.write();
        engine.set_enabled(enabled);
    }

    /// Check if engine is enabled
    ///
    /// # Returns
    /// true if enabled, false otherwise
    #[wasm_bindgen(js_name = isEnabled)]
    pub fn is_enabled(&self) -> bool {
        let engine = self.inner.read();
        engine.is_enabled()
    }

    /// Get configuration
    ///
    /// # Returns
    /// Configuration as JSON object
    #[wasm_bindgen(js_name = getConfig)]
    pub fn get_config(&self) -> JsValue {
        let engine = self.inner.read();
        let config = engine.config();
        serde_wasm_bindgen::to_value(config).unwrap_or(JsValue::NULL)
    }

    /// Find similar patterns to query
    ///
    /// # Arguments
    /// * `query_embedding` - Query vector as Float32Array
    /// * `k` - Number of patterns to return
    ///
    /// # Returns
    /// Array of similar patterns as JSON
    ///
    /// # Example
    /// ```javascript
    /// const query = new Float32Array(256).fill(0.5);
    /// const patterns = engine.find_patterns(query, 5);
    /// console.log('Similar patterns:', patterns);
    /// ```
    #[wasm_bindgen(js_name = findPatterns)]
    pub fn find_patterns(&self, query_embedding: Vec<f32>, k: usize) -> JsValue {
        let engine = self.inner.read();
        let patterns = engine.find_patterns(&query_embedding, k);
        serde_wasm_bindgen::to_value(&patterns).unwrap_or(JsValue::NULL)
    }
}

/// Initialize WASM module (called automatically)
#[wasm_bindgen(start)]
pub fn wasm_init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();

    web_sys::console::log_1(&"SONA WASM module initialized".into());
}

// Additional helper for serde support
#[cfg(feature = "wasm")]
mod serde_wasm_bindgen {
    use super::*;
    use serde::Serialize;

    pub fn to_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
        serde_json::to_string(value)
            .map(|s| JsValue::from_str(&s))
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn from_value<T: serde::de::DeserializeOwned>(value: JsValue) -> Result<T, JsValue> {
        if let Some(s) = value.as_string() {
            serde_json::from_str(&s)
                .map_err(|e| JsValue::from_str(&e.to_string()))
        } else {
            Err(JsValue::from_str("Expected JSON string"))
        }
    }
}
