export async function generateImages(prompt: string): Promise<{ imageA: string; imageB: string }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Return mock images (using placeholders with the prompt as text)
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 20));
  return {
    imageA: `https://placehold.co/600x400/e2e8f0/1e293b?text=${encodedPrompt}+A`,
    imageB: `https://placehold.co/600x400/e2e8f0/1e293b?text=${encodedPrompt}+B`,
  };
}

export async function generateMoodBoard(brand: string, product: string): Promise<string[]> {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const items = [];
    for(let i=0; i<6; i++) {
        items.push(`https://placehold.co/400x600/cbd5e1/1e293b?text=Mood+${i+1}`);
    }
    return items;
}
