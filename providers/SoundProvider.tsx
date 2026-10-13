'use client';
import { createContext, useContext, useEffect, useRef } from 'react';
import { Howl } from 'howler';

interface SoundContextType {
    playPop: () => void;
    playGoal: () => void;
    playWhistle: () => void;
    playWin: () => void;
}

const SoundContext = createContext<SoundContextType>({
    playPop: () => { },
    playGoal: () => { },
    playWhistle: () => { },
    playWin: () => { },
});

export function SoundProvider({ children }: { children: React.ReactNode }) {
    const pop = useRef<Howl | null>(null);
    const goal = useRef<Howl | null>(null);
    const whistle = useRef<Howl | null>(null);
    const win = useRef<Howl | null>(null);

    useEffect(() => {
        // Howler automatically unlocks browser audio restrictions on the first user click
        pop.current = new Howl({ src: ['/sounds/pop.mp3'], volume: 0.4 });
        goal.current = new Howl({ src: ['/sounds/goal.mp3'], volume: 0.6 });
        whistle.current = new Howl({ src: ['/sounds/whistle.mp3'], volume: 0.5 });
        win.current = new Howl({ src: ['/sounds/win.mp3'], volume: 0.7 });
    }, []);

    const playPop = () => pop.current?.play();
    const playGoal = () => goal.current?.play();
    const playWhistle = () => whistle.current?.play();
    const playWin = () => win.current?.play();

    return (
        <SoundContext.Provider value={{ playPop, playGoal, playWhistle, playWin }}>
            {children}
        </SoundContext.Provider>
    );
}

export const useSound = () => useContext(SoundContext);