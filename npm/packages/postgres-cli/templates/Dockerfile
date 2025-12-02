# RuVector PostgreSQL Docker Image
# High-performance vector similarity search with SIMD optimization
#
# Build: docker build -t ruvector/postgres:16 --build-arg PG_VERSION=16 .
# Run:   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret ruvector/postgres:16

ARG PG_VERSION=16
FROM postgres:${PG_VERSION}

LABEL maintainer="RuVector Team <info@ruv.io>"
LABEL description="PostgreSQL with RuVector vector similarity search extension"
LABEL org.opencontainers.image.source="https://github.com/ruvnet/ruvector"
LABEL org.opencontainers.image.licenses="MIT"

ARG PG_VERSION=16
ARG RUVECTOR_VERSION=0.1.0
ARG SIMD_MODE=auto

ENV RUVECTOR_VERSION=${RUVECTOR_VERSION}
ENV PG_VERSION=${PG_VERSION}

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    libssl-dev \
    libclang-dev \
    clang \
    llvm-dev \
    cmake \
    git \
    curl \
    ca-certificates \
    postgresql-server-dev-${PG_VERSION} \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"

# Install pgrx
RUN cargo install cargo-pgrx --version "0.12.9" --locked

# Initialize pgrx
RUN cargo pgrx init --pg${PG_VERSION} /usr/bin/pg_config

# Clone and build RuVector
WORKDIR /build
RUN git clone --depth 1 https://github.com/ruvnet/ruvector.git .

# Build with appropriate SIMD mode
WORKDIR /build/crates/ruvector-postgres

# Set SIMD features based on mode
RUN if [ "${SIMD_MODE}" = "avx512" ]; then \
        export FEATURES="pg${PG_VERSION},simd-avx512"; \
    elif [ "${SIMD_MODE}" = "avx2" ]; then \
        export FEATURES="pg${PG_VERSION},simd-avx2"; \
    elif [ "${SIMD_MODE}" = "neon" ]; then \
        export FEATURES="pg${PG_VERSION},simd-neon"; \
    else \
        export FEATURES="pg${PG_VERSION}"; \
    fi && \
    RUSTFLAGS="-C target-cpu=native" cargo pgrx package --pg-config /usr/bin/pg_config --features "${FEATURES:-pg${PG_VERSION}}"

# Install extension
RUN cp /build/target/release/ruvector-pg${PG_VERSION}/usr/lib/postgresql/${PG_VERSION}/lib/ruvector.so \
    /usr/lib/postgresql/${PG_VERSION}/lib/ && \
    cp /build/target/release/ruvector-pg${PG_VERSION}/usr/share/postgresql/${PG_VERSION}/extension/ruvector* \
    /usr/share/postgresql/${PG_VERSION}/extension/

# Cleanup build artifacts to reduce image size
WORKDIR /
RUN rm -rf /build /root/.cargo /root/.rustup
RUN apt-get purge -y --auto-remove \
    build-essential \
    pkg-config \
    libssl-dev \
    libclang-dev \
    clang \
    llvm-dev \
    cmake \
    git \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy initialization scripts
COPY docker-entrypoint-initdb.d/ /docker-entrypoint-initdb.d/

# Configure PostgreSQL for vector workloads
RUN echo "# RuVector optimizations" >> /usr/share/postgresql/postgresql.conf.sample && \
    echo "shared_preload_libraries = ''" >> /usr/share/postgresql/postgresql.conf.sample && \
    echo "max_parallel_workers_per_gather = 4" >> /usr/share/postgresql/postgresql.conf.sample && \
    echo "max_parallel_maintenance_workers = 4" >> /usr/share/postgresql/postgresql.conf.sample && \
    echo "maintenance_work_mem = '2GB'" >> /usr/share/postgresql/postgresql.conf.sample && \
    echo "effective_cache_size = '4GB'" >> /usr/share/postgresql/postgresql.conf.sample

EXPOSE 5432

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD pg_isready -U postgres || exit 1

# Default command
CMD ["postgres"]
