import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ocrHandwriting } from '@/lib/ai/claude'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type || 'image/jpeg'

  // Upload original image to Supabase Storage
  let imageUrl: string | null = null
  try {
    const supabase = await createClient()
    const fileName = `captures/${Date.now()}-${file.name}`
    const { data: uploadData } = await supabase.storage
      .from('uploads')
      .upload(fileName, bytes, { contentType: mediaType })
    if (uploadData) {
      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(fileName)
      imageUrl = urlData.publicUrl
    }
  } catch {
    // Image URL is optional — OCR still works without it
  }

  const text = await ocrHandwriting(base64, mediaType)

  return NextResponse.json({ text, imageUrl })
}
