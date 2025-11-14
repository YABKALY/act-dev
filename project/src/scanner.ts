import jsQR from 'jsqr';

export class QRScanner {
  private video: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private animationId: number | null = null;
  private onScanCallback: ((data: string) => void) | null = null;

  constructor(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.video = video;
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    this.context = ctx;
  }

  async start(onScan: (data: string) => void): Promise<void> {
    this.onScanCallback = onScan;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      this.video.srcObject = this.stream;
      this.video.setAttribute('playsinline', 'true');
      await this.video.play();

      this.scan();
    } catch (error) {
      throw new Error('Failed to access camera: ' + (error as Error).message);
    }
  }

  stop(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.video.srcObject = null;
  }

  private scan(): void {
    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      this.canvas.width = this.video.videoWidth;
      this.canvas.height = this.video.videoHeight;

      this.context.drawImage(
        this.video,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      const imageData = this.context.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data && this.onScanCallback) {
        this.onScanCallback(code.data);
        return;
      }
    }

    this.animationId = requestAnimationFrame(() => this.scan());
  }
}
