'use client';

import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import MoodBoard from '@/components/MoodBoard';
import ChatInterface from '@/components/ChatInterface';
import ComparisonView from '@/components/ComparisonView';
import OnboardingModal from '@/components/OnboardingModal';
import PromptEditor from '@/components/PromptEditor';
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
  const [editingMoodItem, setEditingMoodItem] = useState<MoodBoardItem | null>(null);
  const [editingProposal, setEditingProposal] = useState<ChatMessage | null>(null); // New state for proposal editing

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
        console.log("Sending to webhook for prompt engineering:", text);

        try {
            // Prepare image IDs for webhook
            const imageIds = referencedItems.map(item => item?.id).filter(Boolean);

            // Call webhook to generate engineered prompt
            const webhookResponse = await fetch('https://maxipad.app.n8n.cloud/webhook/edit-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userInput: text,
                    imageIds: imageIds,
                    userId: userId,
                    sessionId: sessionId
                })
            });

            const webhookData = await webhookResponse.json();
            const engineeredPrompt = webhookData.engineeredPrompt || webhookData.prompt || `High-end photography of ${text}`;

            console.log('Engineered prompt from webhook:', engineeredPrompt);

            // Log classification for reference
            await supabase.from('classifier_logs').insert({
                session_id: sessionId,
                user_input: text,
                classification_json: {
                    intent: 'generate_image',
                    subject: text,
                    imageIds: imageIds,
                    engineeredPrompt: engineeredPrompt
                }
            });

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
                    referenceImages: referencedItems.length > 0
                        ? referencedItems.map(r => r.imageUrl)
                        : undefined
                }
            };

            setMessages(prev => [...prev, proposalMsg]);
            saveMessage(sessionId, proposalMsg);

        } catch (webhookError) {
            console.error('Webhook failed, using fallback prompt:', webhookError);

            // Fallback prompt generation if webhook fails
            const fallbackPrompt = `High-end photography of ${text}, studio lighting, 4k resolution`;

            setIsGenerating(false);

            const proposalMsg: ChatMessage = {
                id: uuidv4(),
                role: 'assistant',
                content: "Here is a prompt based on your request:",
                type: 'proposal',
                proposal: {
                    prompt: fallbackPrompt,
                    status: 'pending',
                    referenceImages: referencedItems.length > 0
                        ? referencedItems.map(r => r.imageUrl)
                        : undefined
                }
            };

            setMessages(prev => [...prev, proposalMsg]);
            saveMessage(sessionId, proposalMsg);
        }
        
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
    const referenceImagesUrls = message?.proposal?.referenceImages;

    console.log('handleProposalAccept called:', {
        msgId,
        prompt,
        foundMessage: !!message,
        referenceImagesCount: referenceImagesUrls?.length || 0,
        referenceImages: referenceImagesUrls
    });

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
        // Convert up to 2 reference images to base64
        let referenceImages: string[] | undefined;
        if (referenceImagesUrls && referenceImagesUrls.length > 0) {
            const imagesToConvert = referenceImagesUrls.slice(0, 2); // Take up to 2 images
            console.log('Converting reference images to base64:', imagesToConvert);
            referenceImages = await Promise.all(
                imagesToConvert.map(url => imageToBase64(url))
            );
            console.log('Converted to base64, sending to API:', referenceImages.length, 'images');
        } else {
            console.log('No reference images to convert');
        }

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                referenceImages // Pass up to 2 reference images as base64
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
    if (!currentGeneration || !sessionId || !userId) return;

    const winnerUrl = selected === 'A' ? currentGeneration.imageA : currentGeneration.imageB;

    // Find or create "Generated" folder
    let generatedFolder = userFolders.find(f => f.name.toLowerCase() === 'generated');

    if (!generatedFolder) {
      // Create the Generated folder
      const { data: newFolder, error: folderError } = await supabase
        .from('folders')
        .insert({ name: 'Generated', user_id: userId })
        .select()
        .single();

      if (newFolder && !folderError) {
        generatedFolder = { id: newFolder.id, name: 'Generated', items: [] };
        setUserFolders(prev => [...prev, generatedFolder!]);
      }
    }

    const newItem: MoodBoardItem = {
        id: uuidv4(),
        imageUrl: winnerUrl,
        description: currentGeneration.prompt,
        isCurated: true,
        orderIndex: moodBoardItems.length
    };

    setMoodBoardItems(prev => [...prev, newItem]);

    // Save to mood_board_items with folder_id
    await supabase.from('mood_board_items').insert({
        id: newItem.id,
        session_id: sessionId,
        image_url: newItem.imageUrl,
        description: newItem.description,
        order_index: moodBoardItems.length,
        added_by: userId,
        folder_id: generatedFolder?.id // Save to Generated folder
    });

    await supabase.from('generations').update({
        selected_image_url: winnerUrl,
        user_explanation: explanation
    }).eq('id', currentGeneration.id);

    setCurrentGeneration(null);

    const confirmMsg: ChatMessage = {
        id: uuidv4(),
        role: 'assistant',
        content: `Great choice. I've added it to the board and your Generated folder.`,
        type: 'text'
    };
    setMessages(prev => [...prev, confirmMsg]);
    saveMessage(sessionId, confirmMsg);

    // Refresh folders to show new item count
    if (userId) loadUserFolders(userId);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const handleMoodBoardChange = async (newItems: MoodBoardItem[]) => {
      // Identify removed items
      const removedItems = moodBoardItems.filter(item => !newItems.find(n => n.id === item.id));
      
      // Re-index remaining items
      const reIndexedItems = newItems.map((item, index) => ({
          ...item,
          orderIndex: index
      }));

      // Update UI immediately with re-indexed items
      setMoodBoardItems(reIndexedItems);

      // Delete removed items from DB
      if (removedItems.length > 0) {
          const idsToDelete = removedItems.map(i => i.id);
          const { error } = await supabase
            .from('mood_board_items')
            .delete()
            .in('id', idsToDelete);
          
          if (error) {
              console.error("Failed to delete items:", error);
          } else {
              // Sync with userFolders state
              setUserFolders(prev => prev.map(folder => ({
                  ...folder,
                  items: folder.items.filter(item => !idsToDelete.includes(item.id))
              })));
          }
      }
      
      // Update order indices in DB for all remaining items
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
      console.log('Moving item to folder:', { itemId, folderId });

      // Update DB
      const { data, error } = await supabase
        .from('mood_board_items')
        .update({ folder_id: folderId })
        .eq('id', itemId)
        .select();

      if (error) {
          console.error('Error moving to folder:', error);
          alert('Failed to move to folder. Check console.');
          return;
      }

      console.log('Successfully moved to folder:', data);

      // Refresh Folders to show new state
      if (userId) {
          await loadUserFolders(userId);
      }

      alert("Moved to folder!");
  };

  const handleFileUpload = async (file: File) => {
      // Reuse handleSendMessage logic for upload
      // But we don't want to add a text message, just upload and add to board.
      // We can call handleSendMessage('', file) which does exactly that!
      handleSendMessage('', file);
  };

  const handleUpdateDescription = async (description: string) => {
      if (!editingMoodItem) return;

      // Update local state
      setEditingMoodItem({ ...editingMoodItem, description });
      setMoodBoardItems(prev => prev.map(i =>
          i.id === editingMoodItem.id ? { ...i, description } : i
      ));

      // Update database
      await supabase.from('mood_board_items').update({ description }).eq('id', editingMoodItem.id);
  };

  const imageToBase64 = async (imageUrl: string): Promise<string> => {
      // Fetch the image
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // Convert to base64
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
      });
  };

  const handleModifyImage = async (modificationPrompt: string) => {
      if (!editingMoodItem || !sessionId) return;

      try {
          setIsGenerating(true);

          // 1. Convert image to base64
          const imageBase64 = await imageToBase64(editingMoodItem.imageUrl);

          // 2. Call the edit API
          const response = await fetch('/api/edit-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  imageBase64,
                  modificationPrompt
              })
          });

          if (!response.ok) {
              throw new Error('Failed to modify image');
          }

          const data = await response.json();

          if (data.modifiedImage) {
              // 3. Upload the modified image to Supabase
              const base64Data = data.modifiedImage.split(',')[1];
              const blob = await fetch(data.modifiedImage).then(r => r.blob());
              const fileName = `${uuidv4()}.jpg`;
              const filePath = `${sessionId}/${fileName}`;

              const { error: uploadError } = await supabase.storage
                  .from('uploads')
                  .upload(filePath, blob);

              if (uploadError) {
                  console.error('Upload error:', uploadError);
                  throw new Error('Failed to upload modified image');
              }

              const { data: { publicUrl } } = supabase.storage
                  .from('uploads')
                  .getPublicUrl(filePath);

              // 4. Update mood board item with new image
              const updatedItem = { ...editingMoodItem, imageUrl: publicUrl };
              setEditingMoodItem(updatedItem);
              setMoodBoardItems(prev => prev.map(i =>
                  i.id === editingMoodItem.id ? updatedItem : i
              ));

              // 5. Update database
              await supabase.from('mood_board_items')
                  .update({ image_url: publicUrl })
                  .eq('id', editingMoodItem.id);

              alert('Image modified successfully!');
          }
      } catch (error) {
          console.error('Image modification error:', error);
          alert('Failed to modify image. Please try again.');
      } finally {
          setIsGenerating(false);
      }
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
            onProposalEdit={setEditingProposal}
            isGenerating={isGenerating}
        />
      </div>

      {/* Right: Visual Workspace */}
      <div className="flex-1 h-full overflow-y-auto flex flex-col">
        {editingProposal ? (
          <PromptEditor
            originalProposal={editingProposal}
            onClose={() => setEditingProposal(null)}
            onGenerate={(prompt) => {
              setEditingProposal(null);
              handleProposalAccept(editingProposal.id, prompt);
            }}
            sessionId={sessionId || ''}
            userId={userId || ''}
          />
        ) : (
          <div className="p-6 flex flex-col gap-8">
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
                    onFileUpload={handleFileUpload}
                    onEdit={setEditingMoodItem}
                />
            )}

            {currentGeneration && (
                 <div className="opacity-50 pointer-events-none grayscale">
                    <MoodBoard items={moodBoardItems} onItemsChange={() => {}} />
                 </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingMoodItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[80vh]">
                {/* Image Preview */}
                <div className="w-full md:w-1/2 bg-gray-100 relative min-h-[300px]">
                    <img src={editingMoodItem.imageUrl} className="w-full h-full object-contain absolute inset-0" />
                    {isGenerating && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                            <div className="bg-white rounded-lg p-4 flex flex-col items-center gap-2">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                <p className="text-sm font-medium text-gray-700">Modifying image...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="w-full md:w-1/2 p-6 flex flex-col gap-6 overflow-y-auto">
                    <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold">Edit Image</h3>
                        <button
                            onClick={() => setEditingMoodItem(null)}
                            disabled={isGenerating}
                            className="p-1 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>

                    {/* Description Editor */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Description</label>
                        <textarea
                            className="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none disabled:opacity-50"
                            rows={4}
                            value={editingMoodItem.description || ''}
                            onChange={(e) => handleUpdateDescription(e.target.value)}
                            placeholder="Add a description..."
                            disabled={isGenerating}
                        />
                        <div className="text-xs text-gray-400 mt-1 text-right">Saved automatically</div>
                    </div>

                    {/* AI Modification */}
                    <div className="pt-6 border-t border-gray-100">
                        <label className="block text-xs font-semibold text-blue-600 uppercase mb-2 flex items-center gap-2">
                            Modify with AI <span className="bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full text-[10px]">Beta</span>
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                id="modifyInput"
                                className="flex-1 p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                                placeholder="e.g. Make it cyberpunk style"
                                disabled={isGenerating}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !isGenerating) {
                                        handleModifyImage(e.currentTarget.value);
                                        e.currentTarget.value = '';
                                    }
                                }}
                            />
                            <button
                                onClick={() => {
                                    const input = document.getElementById('modifyInput') as HTMLInputElement;
                                    if (input.value) {
                                        handleModifyImage(input.value);
                                        input.value = '';
                                    }
                                }}
                                disabled={isGenerating}
                                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isGenerating ? 'Processing...' : 'Go'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}
    </main>
  );
}
