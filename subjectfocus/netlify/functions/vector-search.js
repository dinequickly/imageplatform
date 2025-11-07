import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

/**
 * Vector Search Function for Canvas RAG
 * POST /api/vector-search
 *
 * Retrieves semantically similar Canvas content chunks for RAG integration
 */

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function handler(event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {}
    const {
      query,
      study_set_id,
      user_id,
      match_count = 5,
      match_threshold = 0.7
    } = body

    // Validate required fields
    if (!query || !study_set_id || !user_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required fields: query, study_set_id, user_id'
        })
      }
    }

    console.log('Vector search request:', { query, study_set_id, user_id })

    // Step 1: Fetch the study set to get linked Canvas courses
    const { data: studySet, error: studySetError } = await supabase
      .from('study_sets')
      .select('linked_canvas_courses')
      .eq('id', study_set_id)
      .eq('user_id', user_id)
      .single()

    if (studySetError) {
      console.error('Study set lookup error:', studySetError)
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Study set not found' })
      }
    }

    // If no linked Canvas courses, return empty results
    if (!studySet?.linked_canvas_courses || studySet.linked_canvas_courses.length === 0) {
      console.log('No linked Canvas courses for study set:', study_set_id)
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          results: [],
          message: 'No linked Canvas courses. Link a Canvas course for context-aware responses.'
        })
      }
    }

    console.log('Linked Canvas courses:', studySet.linked_canvas_courses)

    // Step 2: Generate embedding for the query using OpenAI
    console.log('Generating embedding for query...')
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    })

    if (!embeddingResponse.data || !embeddingResponse.data[0]) {
      throw new Error('Failed to generate embedding from OpenAI')
    }

    const queryEmbedding = embeddingResponse.data[0].embedding
    console.log('Embedding generated, dimensions:', queryEmbedding.length)

    // Step 3: Call the search_canvas_vectors RPC function
    console.log('Searching vectors with threshold:', match_threshold, 'limit:', match_count)
    const { data: results, error: searchError } = await supabase.rpc(
      'search_canvas_vectors',
      {
        query_embedding: queryEmbedding,
        course_ids: studySet.linked_canvas_courses,
        user_id_param: user_id,
        match_threshold,
        match_count
      }
    )

    if (searchError) {
      console.error('Vector search error:', searchError)
      throw new Error(`Vector search failed: ${searchError.message}`)
    }

    console.log(`Found ${results?.length || 0} matching vectors`)

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: results || [] })
    }

  } catch (error) {
    console.error('Vector search function error:', error)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: error?.message || 'Vector search failed'
      })
    }
  }
}
