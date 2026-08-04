import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, Smartphone, Check } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already running in standalone mode (PWA installed and opened)
    const isInStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://');

    setIsStandalone(isInStandalone);

    // Detect iOS
    const ua = window.navigator.userAgent;
    const isApple = /iphone|ipad|ipod/i.test(ua);
    setIsIOS(isApple);

    // Capture beforeinstallprompt for Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setShowModal(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        setShowModal(false);
      }
      setDeferredPrompt(null);
    } else if (isIOS) {
      setShowModal(true);
    } else {
      setShowModal(true);
    }
  };

  if (isStandalone || installed) {
    return null; // Don't show banner if already running as installed PWA
  }

  return (
    <>
      {/* Top Banner or Floating Button */}
      <div className="absolute top-3 right-3 z-50 flex items-center gap-2">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-full shadow-lg transition-all active:scale-95 border border-emerald-400/30 backdrop-blur-md"
          title="安装到桌面 / 手机主屏幕"
        >
          <Smartphone className="w-4 h-4" />
          <span>安装应用</span>
        </button>
      </div>

      {/* Modal Dialog */}
      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 text-white rounded-2xl p-5 shadow-2xl">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <img src="/pwa-192x192.png" alt="观鸟导航" className="w-12 h-12 rounded-xl shadow-md border border-slate-700" />
              <div>
                <h3 className="font-bold text-base text-slate-100">安装观鸟导航</h3>
                <p className="text-xs text-slate-400">直接在手机主屏幕打开使用，免浏览器框</p>
              </div>
            </div>

            {deferredPrompt ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  点击下方按钮直接将应用安装到手机桌面上，支持离线地图缓存与快速访问。
                </p>
                <button
                  onClick={handleInstallClick}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  <Download className="w-4 h-4" />
                  立即安装到手机桌面
                </button>
              </div>
            ) : isIOS ? (
              <div className="space-y-3 text-xs text-slate-300">
                <p className="font-medium text-emerald-400">iOS Safari 安装步骤：</p>
                <ol className="space-y-2 pl-1">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-bold">1</span>
                    <span className="flex items-center gap-1">
                      点击 Safari 底部栏的 <Share className="w-3.5 h-3.5 text-blue-400 inline" /> <strong>【分享】</strong> 按钮
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-bold">2</span>
                    <span className="flex items-center gap-1">
                      向下滚动菜单，找到并选择 <PlusSquare className="w-3.5 h-3.5 text-emerald-400 inline" /> <strong>【添加到主屏幕】</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-bold">3</span>
                    <span>点击右上角 <strong>【添加】</strong> 即可从桌面一键打开！</span>
                  </li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-300">
                <p className="font-medium text-emerald-400">通用安装步骤（Android / Chrome / 微信）：</p>
                <ol className="space-y-2 pl-1">
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-bold">1</span>
                    <span>在浏览器右上角菜单 (...) 中找到 <strong>【添加到主屏幕】</strong> 或 <strong>【安装应用】</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 text-[10px] font-bold">2</span>
                    <span>若在微信/QQ内部打不开，请点击右上角选择 <strong>【在浏览器中打开】</strong> 后重试</span>
                  </li>
                </ol>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
