import modal
import json
import base64

app = modal.App("podcast-elevenlabs")

@app.function(
    secrets=[modal.Secret.from_name("elevenlabs-api-key")],
    timeout=600,
    image=modal.Image.debian_slim().pip_install("elevenlabs==2.21.0").pip_install("fastapi[standard]")
)
@modal.fastapi_endpoint(method="POST")
def generate_dialogue(data: dict):
    from elevenlabs.client import ElevenLabs
    import os
    
    try:
        dialogue = data.get('dialogue', [])
        
        if not dialogue:
            return {'success': False, 'error': 'No dialogue provided'}
        
        client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
        
        # Remove model_id and language_code - not needed for text_to_dialogue
        audio_generator = client.text_to_dialogue.convert(
            inputs=dialogue
        )
        
        audio_bytes = b''.join(audio_generator)
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        return {
            'success': True,
            'audio_base64': audio_base64,
            'size_bytes': len(audio_bytes)
        }
        
    except Exception as e:
        import traceback
        return {
            'success': False,
            'error': str(e),
            'traceback': traceback.format_exc()
        }