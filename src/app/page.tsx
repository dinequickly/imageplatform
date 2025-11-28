'use client';

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import MoodBoard from '@/components/MoodBoard';
import ChatInterface from '@/components/ChatInterface';
import ComparisonView from '@/components/ComparisonView';
import OnboardingModal from '@/components/OnboardingModal';
import { MoodBoardItem, ChatMessage, Generation, Profile, FolderWithItems } from '@/types';
import { generateMoodBoard } from '@/lib/imagen'; // Keep mock for initial moodboard for now
import { createClient } from '@/lib/supabase/client';

export default function Home() {
  const [moodBoardItems, setMoodBoardItems] = useState<MoodBoardItem[]>([]);
  const [userFolders, setUserFolders] = useState<FolderWithItems[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentGeneration, setCurrentGeneration] = useState<Generation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  // 1. Auth & Session Initialization
  useEffect(() => {
    const initSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUserId(user.id);
      loadUserFolders(user.id);

      // Check Profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (profileError || !profile || !profile.company_name) {
         setShowOnboarding(true);
      } else {
         setShowOnboarding(false);
      }

      // Check for existing open session or create new
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      let activeSessionId = sessions && sessions.length > 0 ? sessions[0].id : null;

      if (!activeSessionId) {
        const { data: newSession, error } = await supabase
          .from('sessions')
          .insert({ user_id: user.id })
          .select()
          .single();
        
        if (newSession) activeSessionId = newSession.id;
      }

      if (activeSessionId) {
        setSessionId(activeSessionId);
        loadSessionData(activeSessionId);
      }
    };

    initSession();
  }, []);

  const loadUserFolders = async (uid: string) => {
      const { data: folders } = await supabase.from('folders').select('*').eq('user_id', uid);
      if (!folders || folders.length === 0) return;

      const folderIds = folders.map(f => f.id);

      const { data: items, error } = await supabase
        .from('mood_board_items')
        .select('*')
        .in('folder_id', folderIds);

      if (error) console.error("Error fetching folder items:", error);
      
      const foldersWithItems: FolderWithItems[] = folders.map(f => ({
          id: f.id,
          name: f.name,
          items: items?.filter((i: any) => i.folder_id === f.id).map((i: any) => ({
              id: i.id,
              imageUrl: i.image_url,
              description: i.description,
              name: i.name,
              isCurated: i.is_curated,
              orderIndex: i.order_index 
          })).map((item, idx) => ({ ...item, orderIndex: idx })) || []
      }));
      
      setUserFolders(foldersWithItems);
  };

  const handleOnboardingComplete = async (data: Partial<Profile>) => {
      if (!userId) return;
      
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...data, email: (await supabase.auth.getUser()).data.user?.email }); 
      
      if (error) {
          console.error('Failed to save profile:', error);
          alert('Failed to save profile. Check console.');
          return;
      }

      setShowOnboarding(false);
  };


  const loadSessionData = async (sid: string) => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .eq('session_id', sid)
      .order('created_at', { ascending: true });
    
    if (msgs && msgs.length > 0) {
      setMessages(msgs.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        type: m.type as 'text' | 'proposal' | 'image',
        imageUrl: m.image_url,
        proposal: m.type === 'proposal' ? {
          prompt: m.proposal_prompt,
          status: m.proposal_status
        } : undefined
      })));
    } else {
       const initialMsg = {
          id: uuidv4(),
          role: 'assistant',
          content: "Welcome to Pressed. Let's define your visual style. Tell me about your brand and product.",
          type: 'text'
       } as const; 
       
       await saveMessage(sid, initialMsg);
       setMessages([initialMsg]);
    }

    const { data: items } = await supabase
      .from('mood_board_items')
      .select('*')
      .eq('session_id', sid)
      .order('order_index', { ascending: true });
    
    if (items) {
      setMoodBoardItems(items.map((i: any) => ({
        id: i.id,
        imageUrl: i.image_url,
        description: i.description,
        name: i.name,
        isCurated: i.is_curated,
        orderIndex: i.order_index
      })));
    }
  };

  const saveMessage = async (sid: string, msg: ChatMessage) => {
    await supabase.from('messages').insert({
      id: msg.id,
      session_id: sid,
      role: msg.role,
      content: msg.content,
      type: msg.type,
      image_url: msg.imageUrl,
      proposal_prompt: msg.proposal?.prompt,
      proposal_status: msg.proposal?.status
    });
  };

  const isSendingRef = React.useRef(false);

  const handleSendMessage = async (text: string, file?: File) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    console.log('handleSendMessage called:', text, file ? 'with file' : 'no file');
    
    if (!sessionId) {
        isSendingRef.current = false;
        return;
    }

    try {
        let imageUrl = '';
        
        if (file) {
            const fileExt = file.name.split('.').pop();
            const fileName = `${uuidv4()}.${fileExt}`;
            const filePath = `${sessionId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('uploads')
                .upload(filePath, file);

            if (uploadError) {
                console.error('Upload error:', uploadError);
                return;
            }

            const { data: { publicUrl } } = supabase.storage
                .from('uploads')
                .getPublicUrl(filePath);
            
            imageUrl = publicUrl;
            console.log('Image Uploaded:', imageUrl);

            const defaultName = file.name.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
            const newItem: MoodBoardItem = {
                id: uuidv4(),
                imageUrl: publicUrl,
                description: 'Uploaded image',
                name: defaultName,
                isCurated: true,
                orderIndex: moodBoardItems.length
            };
            setMoodBoardItems(prev => [...prev, newItem]);
            await supabase.from('mood_board_items').insert({
                id: newItem.id,
                session_id: sessionId,
                image_url: newItem.imageUrl,
                description: 'Uploaded image',
                name: defaultName,
                order_index: moodBoardItems.length,
                added_by: userId
            });
        }

        // Add User Message
        const userMsgToSave: ChatMessage = { 
            id: uuidv4(), 
            role: 'user', 
            content: text, 
            type: imageUrl ? 'image' : 'text',
            imageUrl: imageUrl || undefined
        };
        setMessages(prev => [...prev, userMsgToSave]);
        saveMessage(sessionId, userMsgToSave);

        if (file) {
            setIsGenerating(true);
            try {
                const webhookResponse = await fetch('https://maxipad.app.n8n.cloud/webhook/7650610d-5a8d-41fe-b111-5f6bfa21d436', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageUrl: imageUrl,
                        userId: userId,
                        sessionId: sessionId,
                        fileName: file.name,
                        timestamp: new Date().toISOString()
                    })
                });
                
                let imageCaption = "An uploaded image";
                try {
                    const webhookData = await webhookResponse.json();
                    imageCaption = webhookData.description || webhookData.caption || webhookData.Description || imageCaption;
                } catch (e) {
                    console.warn('Webhook returned non-JSON or empty response. Using default caption.');
                }

                const botResponse: ChatMessage = {
                    id: uuidv4(),
                    role: 'assistant',
                    content: `I see you added an image. It looks like: "${imageCaption}". How should we use this vibe?`,
                    type: 'text'
                };
                setMessages(prev => [...prev, botResponse]);
                saveMessage(sessionId, botResponse);

            } catch (err) {
                console.error('Webhook failed', err);
                 const fallbackMsg: ChatMessage = {
                    id: uuidv4(),
                    role: 'assistant',
                    content: "I've added your image to the mood board.",
                    type: 'text'
                };
                setMessages(prev => [...prev, fallbackMsg]);
                saveMessage(sessionId, fallbackMsg);
            } finally {
                setIsGenerating(false);
                setTimeout(() => { isSendingRef.current = false; }, 500);
            }
            return; 
        }

        // Standard Text Flow
        const mentionRegex = /@([a-zA-Z0-9_\/]+)/g;
        const matches = [...text.matchAll(mentionRegex)];
        
        const referencedItems: MoodBoardItem[] = [];
        
        for (const match of matches) {
            const rawRef = match[1];
            if (/^\d+$/.test(rawRef)) {
                const idx = parseInt(rawRef) - 1;
                const item = moodBoardItems.find(i => i.orderIndex === idx);
                if (item) referencedItems.push(item);
                continue;
            }
            const namedItem = moodBoardItems.find(i => i.name?.toLowerCase() === rawRef.toLowerCase());
            if (namedItem) {
                referencedItems.push(namedItem);
                continue;
            }
            if (rawRef.includes('/')) {
                 const [folderName, idxStr] = rawRef.split('/');
                 const folder = userFolders.find(f => f.name.toLowerCase() === folderName.toLowerCase());
                 if (folder && /^\d+$/.test(idxStr)) {
                     const idx = parseInt(idxStr) - 1;
                     const item = folder.items[idx];
                     if (item) referencedItems.push(item);
                 }
                 continue;
            }
            const folder = userFolders.find(f => f.name.toLowerCase() === rawRef.toLowerCase());
            if (folder) {
                referencedItems.push(...folder.items.slice(0, 5));
            }
        }

        let classifierPrompt = text;
        // Note: We do NOT inject descriptions into text anymore, per user request.
        // We pass referencedItems structurally to the classifier step.

        if (moodBoardItems.length === 0 && messages.length < 3) {
            setIsGenerating(true);
            const images = await generateMoodBoard("brand", "product"); 
            const newItems = images.map((url, i) => ({
                id: uuidv4(),
                imageUrl: url,
                isCurated: true,
                orderIndex: i
            }));
            setMoodBoardItems(newItems);
            const dbItems = newItems.map(item => ({
                id: item.id,
                session_id: sessionId,
                image_url: item.imageUrl,
                order_index: item.orderIndex,
                added_by: userId
            }));
            await supabase.from('mood_board_items').insert(dbItems);
            setIsGenerating(false);
            const botMsg: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: "I've curated an initial mood board. Remove what doesn't fit.",
                type: 'text'
            };
            setMessages(prev => [...prev, botMsg]);
            saveMessage(sessionId, botMsg);
            setTimeout(() => { isSendingRef.current = false; }, 500);
            return;
        }

        setIsGenerating(true);
        console.log("Sending to classifier:", classifierPrompt);
        
        // Use await delay instead of nested setTimeout to keep try/catch clean
        await new Promise(resolve => setTimeout(resolve, 1500));

        const classificationResult = {
            intent: 'generate_image',
            subject: text,
            style: 'high-end studio',
            references: referencedItems.map(item => ({
                id: item?.id,
                imageUrl: item?.imageUrl,
                description: item?.description,
                name: item?.name
            }))
        };

        await supabase.from('classifier_logs').insert({
            session_id: sessionId,
            user_input: classifierPrompt,
            classification_json: classificationResult
        });

        let referenceContext = "";
        if (classificationResult.references && classificationResult.references.length > 0) {
             const descriptions = classificationResult.references.map(ref => ref.description || ref.name || 'a reference image').join(', ');
             referenceContext = `, incorporating elements from: ${descriptions}.`;
        }

        const engineeredPrompt = `High-end photography of ${classificationResult.subject}, ${classificationResult.style} lighting, 4k resolution${referenceContext}`;

        setIsGenerating(false);

            const proposalMsg: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: "Here is a prompt based on your request:",
                type: 'proposal',
                proposal: {
                    prompt: engineeredPrompt,
                    status: 'pending',
                    // Store the referenced images for generation
                    referenceImages: classificationResult.references && classificationResult.references.length > 0 
                        ? classificationResult.references.map(r => r.imageUrl) 
                        : undefined
                }
            };

        setMessages(prev => [...prev, proposalMsg]);
        saveMessage(sessionId, proposalMsg);
        
    } catch (error) {
        console.error("Error in handleSendMessage:", error);
    } finally {
        setIsGenerating(false);
        setTimeout(() => { isSendingRef.current = false; }, 500);
    }
  };

  const handleProposalAccept = async (msgId: string, prompt: string) => {
    if (!sessionId) return;

    // Find the message to get the reference images
    const message = messages.find(m => m.id === msgId);
    const referenceImages = message?.proposal?.referenceImages;
    const firstReferenceImage = referenceImages && referenceImages.length > 0 ? referenceImages[0] : undefined;

    setMessages(prev => prev.map(m => 
        m.id === msgId && m.proposal 
            ? { ...m, proposal: { ...m.proposal, status: 'accepted', prompt } } 
            : m
    ));

    await supabase
        .from('messages')
        .update({ proposal_status: 'accepted', proposal_prompt: prompt })
        .eq('id', msgId);

    setIsGenerating(true);
    
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                prompt,
                referenceImage: firstReferenceImage // Pass the first reference image URL if it exists
            })
        });
        const data = await response.json();

        if (data.imageA && data.imageB) {
            const generation: Generation = {
                id: uuidv4(),
                prompt,
                imageA: data.imageA,
                imageB: data.imageB
            };
            setCurrentGeneration(generation);
            
            await supabase.from('generations').insert({
                id: generation.id,
                session_id: sessionId,
                prompt_proposed: prompt,
                image_a_url: data.imageA,
                image_b_url: data.imageB
            });
        }
    } catch (error) {
        console.error("Generation failed", error);
    } finally {
        setIsGenerating(false);
    }
  };

  const handleComparisonComplete = async (selected: 'A' | 'B', explanation: string) => {
    if (!currentGeneration || !sessionId) return;

    const winnerUrl = selected === 'A' ? currentGeneration.imageA : currentGeneration.imageB;
    const newItem: MoodBoardItem = {
        id: uuidv4(),
        imageUrl: winnerUrl,
        description: currentGeneration.prompt,
        isCurated: true,
        orderIndex: moodBoardItems.length
    }; 
    
    setMoodBoardItems(prev => [...prev, newItem]);

    await supabase.from('mood_board_items').insert({
        id: newItem.id,
        session_id: sessionId,
        image_url: newItem.imageUrl,
        description: newItem.description,
        order_index: moodBoardItems.length, 
        added_by: userId
    });

    await supabase.from('generations').update({
        selected_image_url: winnerUrl,
        user_explanation: explanation
    }).eq('id', currentGeneration.id);

    setCurrentGeneration(null);

    const confirmMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `Great choice. I've added it to the board.`,
        type: 'text'
    };
    setMessages(prev => [...prev, confirmMsg]);
    saveMessage(sessionId, confirmMsg);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleMoodBoardChange = async (newItems: MoodBoardItem[]) => {
      const removedItems = moodBoardItems.filter(item => !newItems.find(n => n.id === item.id));
      
      const reIndexedItems = newItems.map((item, index) => ({
          ...item,
          orderIndex: index
      }));

      setMoodBoardItems(reIndexedItems);

      if (removedItems.length > 0) {
          const idsToDelete = removedItems.map(i => i.id);
          const { error } = await supabase
            .from('mood_board_items')
            .delete()
            .in('id', idsToDelete);
          
          if (error) {
              console.error("Failed to delete items:", error);
          }
      }
      
      for (const item of reIndexedItems) {
          await supabase
            .from('mood_board_items')
            .update({ order_index: item.orderIndex })
            .eq('id', item.id);
      }
  }

  const handleUpdateName = async (id: string, name: string) => {
      setMoodBoardItems(prev => prev.map(i => i.id === id ? { ...i, name } : i));
      await supabase.from('mood_board_items').update({ name }).eq('id', id);
  };

  const handleMoveToFolder = async (itemId: string, folderId: string) => {
      await supabase.from('mood_board_items').update({ folder_id: folderId }).eq('id', itemId);
      if (userId) loadUserFolders(userId);
      alert("Moved to folder!");
  };

  return (
    <main className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
      <OnboardingModal isOpen={showOnboarding} onComplete={handleOnboardingComplete} />
      
      {/* Left: Chat Interface */}
      <div className="w-2/5 min-w-[400px] max-w-[600px] h-full p-4 flex flex-col relative">
        <ChatInterface 
            messages={messages} 
            moodBoardItems={moodBoardItems}
            folders={userFolders} 
            onSendMessage={handleSendMessage} 
            onProposalAccept={handleProposalAccept}
            isGenerating={isGenerating}
        />
      </div>

      {/* Right: Visual Workspace */}
      <div className="flex-1 h-full overflow-y-auto p-6 flex flex-col gap-8">
        {/* Header */}
        <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold tracking-tight">Pressed. <span className="text-gray-400 font-normal">Creative Director</span></h1>
            <div className="flex items-center gap-4">
                <button 
                    onClick={() => router.push('/folders')} 
                    className="px-4 py-2 bg-black text-white font-medium text-sm rounded-full hover:bg-gray-800 transition-all hover:shadow-lg flex items-center gap-2"
                >
                   <span>Folders</span>
                </button>
                <div className="text-sm text-gray-500">Session: {sessionId?.slice(0,8)}</div>
                <button onClick={handleSignOut} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-600">
                    <LogOut size={18} />
                </button>
            </div>
        </div>

        {/* Comparison View (Active) */}
        {currentGeneration ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <ComparisonView 
                    generation={currentGeneration} 
                    onComplete={handleComparisonComplete} 
                />
            </div>
        ) : (
            <MoodBoard 
                items={moodBoardItems} 
                folders={userFolders}
                onItemsChange={handleMoodBoardChange} 
                onUpdateName={handleUpdateName}
                onMoveToFolder={handleMoveToFolder}
            />
        )}
        
        {currentGeneration && (
             <div className="opacity-50 pointer-events-none grayscale">
                <MoodBoard items={moodBoardItems} onItemsChange={() => {}} />
             </div>
        )}

      </div>
    </main>
  );
}
