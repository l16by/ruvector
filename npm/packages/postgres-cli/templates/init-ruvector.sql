-- RuVector PostgreSQL Initialization Script
-- This script runs automatically when the container starts for the first time
--
-- It creates the RuVector extension and sets up example tables and functions
-- for vector similarity search.

-- ============================================================================
-- EXTENSION SETUP
-- ============================================================================

-- Create RuVector extension
CREATE EXTENSION IF NOT EXISTS ruvector;

-- Verify installation
DO $$
DECLARE
    ext_version TEXT;
BEGIN
    SELECT extversion INTO ext_version FROM pg_extension WHERE extname = 'ruvector';
    IF ext_version IS NOT NULL THEN
        RAISE NOTICE 'RuVector extension installed: version %', ext_version;
    ELSE
        RAISE EXCEPTION 'RuVector extension not found!';
    END IF;
END $$;

-- ============================================================================
-- EXAMPLE TABLES
-- ============================================================================

-- Example: Document embeddings table (OpenAI ada-002 compatible)
CREATE TABLE IF NOT EXISTS embeddings (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding ruvector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example: Half-precision embeddings for memory efficiency
CREATE TABLE IF NOT EXISTS embeddings_half (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding halfvec(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Example: Product catalog with image embeddings (CLIP compatible)
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    image_embedding ruvector(512),  -- CLIP produces 512-dim vectors
    text_embedding ruvector(384),   -- Sentence transformers
    price DECIMAL(10, 2),
    category TEXT,
    metadata JSONB DEFAULT '{}'
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- HNSW index for high-recall similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS embeddings_hnsw_cosine_idx
ON embeddings USING ruhnsw (embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- HNSW index for L2 distance (Euclidean)
-- Uncomment if you need L2 distance
-- CREATE INDEX IF NOT EXISTS embeddings_hnsw_l2_idx
-- ON embeddings USING ruhnsw (embedding ruvector_l2_ops)
-- WITH (m = 16, ef_construction = 64);

-- IVFFlat index for large datasets (memory efficient)
-- Uncomment for large datasets (100K+ vectors)
-- CREATE INDEX IF NOT EXISTS embeddings_ivfflat_idx
-- ON embeddings USING ruivfflat (embedding ruvector_l2_ops)
-- WITH (lists = 100);

-- Product search indexes
CREATE INDEX IF NOT EXISTS products_image_idx
ON products USING ruhnsw (image_embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS products_text_idx
ON products USING ruhnsw (text_embedding ruvector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Similarity search function
CREATE OR REPLACE FUNCTION search_embeddings(
    query_embedding ruvector,
    limit_count INTEGER DEFAULT 10,
    similarity_threshold FLOAT DEFAULT 0.0
)
RETURNS TABLE (
    id INTEGER,
    content TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        e.id,
        e.content,
        1 - (e.embedding <=> query_embedding) AS similarity,
        e.metadata
    FROM embeddings e
    WHERE 1 - (e.embedding <=> query_embedding) >= similarity_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Hybrid search function (vector + keyword)
CREATE OR REPLACE FUNCTION hybrid_search(
    query_embedding ruvector,
    search_text TEXT,
    limit_count INTEGER DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id INTEGER,
    content TEXT,
    vector_score FLOAT,
    text_score FLOAT,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT
            e.id,
            e.content,
            1 - (e.embedding <=> query_embedding) AS v_score
        FROM embeddings e
        ORDER BY e.embedding <=> query_embedding
        LIMIT limit_count * 2
    ),
    text_results AS (
        SELECT
            e.id,
            ts_rank(to_tsvector('english', e.content), plainto_tsquery('english', search_text)) AS t_score
        FROM embeddings e
        WHERE to_tsvector('english', e.content) @@ plainto_tsquery('english', search_text)
    )
    SELECT
        v.id,
        v.content,
        v.v_score AS vector_score,
        COALESCE(t.t_score, 0.0)::FLOAT AS text_score,
        (vector_weight * v.v_score + (1 - vector_weight) * COALESCE(t.t_score, 0.0))::FLOAT AS combined_score
    FROM vector_results v
    LEFT JOIN text_results t ON v.id = t.id
    ORDER BY combined_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Multi-modal product search
CREATE OR REPLACE FUNCTION search_products(
    image_query ruvector DEFAULT NULL,
    text_query ruvector DEFAULT NULL,
    category_filter TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    name TEXT,
    description TEXT,
    price DECIMAL,
    image_similarity FLOAT,
    text_similarity FLOAT,
    combined_score FLOAT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        CASE WHEN image_query IS NOT NULL
            THEN 1 - (p.image_embedding <=> image_query)
            ELSE 0.0
        END AS image_similarity,
        CASE WHEN text_query IS NOT NULL
            THEN 1 - (p.text_embedding <=> text_query)
            ELSE 0.0
        END AS text_similarity,
        CASE
            WHEN image_query IS NOT NULL AND text_query IS NOT NULL THEN
                (0.5 * (1 - (p.image_embedding <=> image_query)) +
                 0.5 * (1 - (p.text_embedding <=> text_query)))
            WHEN image_query IS NOT NULL THEN
                1 - (p.image_embedding <=> image_query)
            WHEN text_query IS NOT NULL THEN
                1 - (p.text_embedding <=> text_query)
            ELSE 0.0
        END AS combined_score
    FROM products p
    WHERE (category_filter IS NULL OR p.category = category_filter)
    ORDER BY combined_score DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER embeddings_updated_at
    BEFORE UPDATE ON embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Grant permissions to all tables and functions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

-- ============================================================================
-- COMPLETION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'RuVector PostgreSQL initialized successfully!';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Available tables:';
    RAISE NOTICE '  - embeddings (1536-dim, OpenAI ada-002 compatible)';
    RAISE NOTICE '  - embeddings_half (half-precision for 50%% memory savings)';
    RAISE NOTICE '  - products (multi-modal search example)';
    RAISE NOTICE '';
    RAISE NOTICE 'Available functions:';
    RAISE NOTICE '  - search_embeddings(query_vector, limit, threshold)';
    RAISE NOTICE '  - hybrid_search(query_vector, search_text, limit, weight)';
    RAISE NOTICE '  - search_products(image_query, text_query, category, limit)';
    RAISE NOTICE '';
    RAISE NOTICE 'Quick test:';
    RAISE NOTICE '  INSERT INTO embeddings (content, embedding)';
    RAISE NOTICE '  VALUES (''Hello world'', ''[0.1, 0.2, ...]''::ruvector);';
    RAISE NOTICE '';
END $$;
