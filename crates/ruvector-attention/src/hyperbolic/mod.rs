//! Hyperbolic Attention Module
//!
//! Implements attention mechanisms in hyperbolic space using the Poincaré ball model.

pub mod hyperbolic_attention;
pub mod mixed_curvature;
pub mod poincare;

pub use poincare::{
    exp_map, frechet_mean, log_map, mobius_add, mobius_scalar_mult, poincare_distance,
    project_to_ball,
};

pub use hyperbolic_attention::{HyperbolicAttention, HyperbolicAttentionConfig};

pub use mixed_curvature::{MixedCurvatureAttention, MixedCurvatureConfig};
