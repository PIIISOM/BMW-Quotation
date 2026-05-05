import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('🔴 Error caught by ErrorBoundary:', error, errorInfo);
    // TODO: ส่งไป Error Tracking Service เช่น Sentry
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-lg text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-red-600 mb-2">
              เกิดข้อผิดพลาด
            </h2>
            <p className="text-neutral-600 mb-4">
              ระบบเกิดข้อผิดพลาดชั่วคราว กรุณารีเฟรชหน้าเว็บ
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-white font-medium hover:bg-blue-700 transition"
            >
              🔄 รีเฟรชหน้าเว็บ
            </button>
            
            {/* แสดง Error Details เฉพาะในโหมด Development */}
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-neutral-500 hover:text-neutral-700">
                  📋 รายละเอียดข้อผิดพลาด (Development Mode)
                </summary>
                <pre className="mt-2 text-xs bg-neutral-100 p-3 rounded overflow-auto max-h-40 text-left">
                  {this.state.error.toString()}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
