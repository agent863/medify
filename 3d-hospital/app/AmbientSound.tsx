"use client";

import { useEffect, useRef, useState } from "react";

type AmbientGraph = {
  context: AudioContext;
  ambientMaster: GainNode;
  chimeGain: GainNode;
  musicGain: GainNode;
  ambient: HTMLAudioElement;
  music: HTMLAudioElement;
};

const playClinicChime = (graph: AmbientGraph) => {
  if (graph.context.state !== "running") return;
  const start = graph.context.currentTime + 0.04;
  [523.25, 659.25].forEach((frequency, index) => {
    const oscillator = graph.context.createOscillator();
    const gain = graph.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + index * 0.22);
    gain.gain.exponentialRampToValueAtTime(
      0.0884,
      start + index * 0.22 + 0.035,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      start + index * 0.22 + 1.45,
    );
    oscillator.connect(gain).connect(graph.chimeGain);
    oscillator.start(start + index * 0.22);
    oscillator.stop(start + index * 0.22 + 1.5);
  });
};

export default function AmbientSound() {
  const [enabled, setEnabled] = useState(false);
  const graphRef = useRef<AmbientGraph | null>(null);

  const createGraph = () => {
    const AudioContextClass =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const context = new AudioContextClass();
    const ambientMaster = context.createGain();
    const chimeGain = context.createGain();
    const musicGain = context.createGain();
    const ambient = new Audio("/hospital-waiting-room-ambience.mp3");
    const music = new Audio("/medify-open-morning.mp3");
    const ambientSource = context.createMediaElementSource(ambient);
    const musicSource = context.createMediaElementSource(music);
    ambientMaster.gain.value = 0.0001;
    chimeGain.gain.value = 0.18;
    musicGain.gain.value = 0.0001;
    ambient.loop = true;
    ambient.preload = "auto";
    music.loop = true;
    music.preload = "auto";
    ambientSource.connect(ambientMaster).connect(context.destination);
    chimeGain.connect(context.destination);
    musicSource.connect(musicGain).connect(context.destination);

    return { context, ambientMaster, chimeGain, musicGain, ambient, music };
  };

  const toggle = async () => {
    let graph = graphRef.current;
    if (!graph) {
      graph = createGraph();
      if (!graph) return;
      graphRef.current = graph;
    }
    if (enabled) {
      const now = graph.context.currentTime;
      graph.ambientMaster.gain.cancelScheduledValues(now);
      graph.musicGain.gain.cancelScheduledValues(now);
      graph.ambientMaster.gain.setValueAtTime(
        Math.max(0.0001, graph.ambientMaster.gain.value),
        now,
      );
      graph.musicGain.gain.setValueAtTime(
        Math.max(0.0001, graph.musicGain.gain.value),
        now,
      );
      graph.ambientMaster.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      graph.musicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      window.setTimeout(() => {
        graph?.ambient.pause();
        graph?.music.pause();
        void graph?.context.suspend();
      }, 300);
      setEnabled(false);
      return;
    }
    // Reflect the user's choice immediately. Some embedded browsers keep the
    // resume promise pending while negotiating an audio device even though the
    // user gesture has already granted playback.
    const resume = graph.context.resume();
    const now = graph.context.currentTime;
    graph.ambientMaster.gain.cancelScheduledValues(now);
    graph.musicGain.gain.cancelScheduledValues(now);
    graph.ambientMaster.gain.setValueAtTime(0.0001, now);
    graph.musicGain.gain.setValueAtTime(0.0001, now);
    graph.ambientMaster.gain.exponentialRampToValueAtTime(0.144, now + 0.7);
    graph.musicGain.gain.exponentialRampToValueAtTime(0.065, now + 0.9);
    setEnabled(true);
    const ambientPlayback = graph.ambient.play();
    const musicPlayback = graph.music.play();
    void resume.catch(() => setEnabled(false));
    void ambientPlayback.catch(() => setEnabled(false));
    void musicPlayback.catch(() => setEnabled(false));
  };

  useEffect(() => {
    const handleClinicCall = () => {
      const graph = graphRef.current;
      if (!enabled || !graph) return;
      playClinicChime(graph);
    };
    window.addEventListener("medify:clinic-call", handleClinicCall);
    return () =>
      window.removeEventListener("medify:clinic-call", handleClinicCall);
  }, [enabled]);

  useEffect(
    () => () => {
      const graph = graphRef.current;
      graph?.ambient.pause();
      graph?.music.pause();
      if (graph) {
        graph.ambient.src = "";
        graph.music.src = "";
      }
      void graph?.context.close();
    },
    [],
  );

  return (
    <button
      type="button"
      className={`ambient-toggle${enabled ? " active" : ""}`}
      aria-label={enabled ? "關閉醫院環境音" : "開啟醫院環境音"}
      aria-pressed={enabled}
      title={enabled ? "關閉醫院環境音" : "開啟醫院環境音"}
      onClick={() => void toggle()}
    >
      <span aria-hidden="true">{enabled ? "♪" : "♩"}</span>
      <b>{enabled ? "環境音開啟" : "環境音關閉"}</b>
    </button>
  );
}
