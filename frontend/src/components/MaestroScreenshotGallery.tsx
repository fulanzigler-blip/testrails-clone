import React, { useState, useEffect, useCallback } from 'react';

interface MaestroScreenshot {
  id: string;
  stepIndex: number;
  filePath: string;
  takenAt: string;
  testCaseId: string | null;
}

interface Props {
  screenshots: MaestroScreenshot[];
}

const MaestroScreenshotGallery: React.FC<Props> = ({ screenshots }) => {
  const [activeScreenshot, setActiveScreenshot] = useState<MaestroScreenshot | null>(null);

  const closeLightbox = useCallback(() => {
    setActiveScreenshot(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeLightbox();
      }
    };

    if (activeScreenshot) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [activeScreenshot, closeLightbox]);

  if (!screenshots || screenshots.length === 0) {
    return (
      <div className="flex items-center justify-center w-full py-10 text-gray-500">
        No screenshots available
      </div>
    );
  }

  const formatTime = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return dateString;
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {screenshots.map((screenshot) => (
          <div key={screenshot.id} className="flex flex-col overflow-hidden rounded-lg border border-gray-200 shadow-sm">
            <div className="cursor-pointer" onClick={() => setActiveScreenshot(screenshot)}>
              <img
                src={`/files/${screenshot.filePath}`}
                alt={`Step ${screenshot.stepIndex}`}
                className="w-full object-cover aspect-video"
              />
            </div>
            <div className="flex justify-between items-center p-2 bg-white">
              <span className="text-xs font-medium text-gray-700">Step {screenshot.stepIndex}</span>
              <span className="text-xs text-gray-500">{formatTime(screenshot.takenAt)}</span>
            </div>
          </div>
        ))}
      </div>

      {activeScreenshot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 cursor-pointer"
          onClick={closeLightbox}
        >
          <img
            src={`/files/${activeScreenshot.filePath}`}
            alt={`Step ${activeScreenshot.stepIndex}`}
            className="max-h-screen max-w-full object-contain p-4"
          />
        </div>
      )}
    </>
  );
};

export default MaestroScreenshotGallery;
