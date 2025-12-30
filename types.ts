export interface VisualizerProps {
  audioElement: HTMLAudioElement | null;
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

export interface AudioState {
  context: AudioContext | null;
  analyser: AnalyserNode | null;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
}
