import { streamText } from 'ai';

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };

  if (!body.text || body.text.trim().length === 0) {
    return Response.json({ error: 'No text provided.' }, { status: 400 });
  }

  const result = streamText({
    model: 'minimax/minimax-m3',
    system:
      'You are a summarization assistant. Summarize the text you are given clearly and concisely, in 3-5 sentences unless the user asks for something different.',
    prompt: body.text,
  });

  return result.toTextStreamResponse();
}
