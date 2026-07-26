"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  componentName: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class SafeErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in:", this.props.componentName, error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl m-4 backdrop-blur-xl">
          <h2 className="text-red-400 font-bold text-xl mb-2">Crash Prevented in {this.props.componentName}</h2>
          <p className="text-red-300 text-sm mb-4">Please screenshot this error and send it to the AI:</p>
          <pre className="bg-black/50 p-4 rounded-xl text-xs text-red-200 overflow-x-auto">
            {this.state.error?.toString()}
            {"\n\n"}
            {this.state.errorInfo?.componentStack}
          </pre>
          <button 
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
