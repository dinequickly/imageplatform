import { useState } from 'react'
import { useAuth } from './useAuth'

/**
 * useCanvasVectorSearch - RAG vector search hook
 *
 * Provides semantic search over Canvas course content
 * Returns matching chunks with similarity scores
 *
 * Usage:
 * ```
 * const { searchVectors, loading, error } = useCanvasVectorSearch()
 * const results = await searchVectors('photosynthesis', studySetId)
 * ```
 */
export function useCanvasVectorSearch() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  /**
   * Search for semantically similar Canvas content
   *
   * @param {string} query - Search query/question
   * @param {string} studySetId - Study set ID to search (must be linked to Canvas courses)
   * @param {Object} options - Optional configuration
   * @param {number} options.matchCount - Number of results to return (default: 5)
   * @param {number} options.matchThreshold - Similarity threshold 0-1 (default: 0.7)
   * @returns {Promise<Array>} Matching chunks with: id, canvas_item_id, item_name, item_type, chunk_text, similarity, metadata
   * @throws {Error} If search fails or missing required parameters
   */
  const searchVectors = async (query, studySetId, options = {}) => {
    setLoading(true)
    setError(null)

    try {
      // Validate required parameters
      if (!query || typeof query !== 'string') {
        throw new Error('Query must be a non-empty string')
      }
      if (!studySetId) {
        throw new Error('Study set ID is required')
      }
      if (!user?.id) {
        throw new Error('User not authenticated')
      }

      console.log('Searching vectors:', { query, studySetId })

      // Call the vector search API endpoint
      const response = await fetch('/api/vector-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          study_set_id: studySetId,
          user_id: user.id,
          match_count: options.matchCount || 5,
          match_threshold: options.matchThreshold || 0.7
        })
      })

      if (!response.ok) {
        throw new Error(`Vector search failed: ${response.statusText}`)
      }

      const data = await response.json()

      // Handle case where no Canvas courses are linked
      if (data.message) {
        console.warn('Vector search message:', data.message)
      }

      const results = data.results || []
      console.log(`Found ${results.length} matching vectors`)

      return results

    } catch (err) {
      const errorMessage = err?.message || 'Vector search failed'
      setError(errorMessage)
      console.error('Vector search error:', errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    searchVectors,
    loading,
    error
  }
}
