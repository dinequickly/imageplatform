import { X, Sparkles, BookOpen, FileText, Mic, ArrowRight, CheckCircle } from 'lucide-react'

export default function AIBenefitsPreviewModal({ course, isOpen, onClose, onContinue }) {
  if (!isOpen || !course) return null

  const examples = [
    {
      icon: Sparkles,
      title: 'Smart Flashcards',
      description: 'AI creates flashcards from your actual lecture notes and readings',
      before: {
        label: 'Without Canvas',
        text: 'Generic flashcard: "What is photosynthesis?"'
      },
      after: {
        label: 'With Your Course Content',
        text: `From Lecture 3: "Explain the light-dependent reactions in chloroplast thylakoids as discussed in Dr. Smith's lecture"`
      }
    },
    {
      icon: FileText,
      title: 'Context-Aware Study Guides',
      description: 'Generate study guides that reference your specific course materials',
      before: {
        label: 'Without Canvas',
        text: 'AI provides general information about the topic'
      },
      after: {
        label: 'With Your Course Content',
        text: 'AI pulls from your syllabus, lecture slides, and readings to create guides that match your exam format'
      }
    },
    {
      icon: Mic,
      title: 'Personalized Study Podcasts',
      description: 'AI-generated podcasts that discuss concepts from your actual assignments',
      before: {
        label: 'Without Canvas',
        text: 'Generic podcast about the subject'
      },
      after: {
        label: 'With Your Course Content',
        text: 'Podcast that explains concepts using examples from your homework and past exams'
      }
    }
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="relative p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Sparkles className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Unlock AI-Powered Study Tools
              </h2>
              <p className="text-sm text-gray-600 mt-1">{course.course_name}</p>
            </div>
          </div>

          <p className="text-gray-700 mt-3">
            Connect your Canvas course content to unlock personalized AI features that learn from <strong>your actual lectures, assignments, and readings</strong>.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* What You'll Get Section */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BookOpen size={20} className="text-blue-600" />
              What You'll Get
            </h3>

            <div className="grid gap-6">
              {examples.map((example, idx) => {
                const Icon = example.icon
                return (
                  <div key={idx} className="border rounded-lg p-5 hover:border-blue-300 transition-colors bg-gray-50">
                    {/* Feature Header */}
                    <div className="flex items-start gap-3 mb-4">
                      <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                        <Icon size={20} className="text-blue-600" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900">{example.title}</h4>
                        <p className="text-sm text-gray-600 mt-1">{example.description}</p>
                      </div>
                    </div>

                    {/* Before/After Comparison */}
                    <div className="grid md:grid-cols-2 gap-4 mt-4">
                      {/* Before */}
                      <div className="bg-white rounded-lg p-4 border-2 border-gray-200">
                        <div className="text-xs font-medium text-gray-500 uppercase mb-2">
                          {example.before.label}
                        </div>
                        <p className="text-sm text-gray-600 italic">
                          {example.before.text}
                        </p>
                      </div>

                      {/* After */}
                      <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border-2 border-blue-300 relative">
                        <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle size={12} />
                          Better
                        </div>
                        <div className="text-xs font-medium text-blue-700 uppercase mb-2">
                          {example.after.label}
                        </div>
                        <p className="text-sm text-gray-900 font-medium">
                          {example.after.text}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* How It Works */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              How It Works
            </h3>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  1
                </span>
                <div>
                  <p className="font-medium text-gray-900">Choose Content Types</p>
                  <p className="text-sm text-gray-600">Select which materials to include (lectures, assignments, etc.)</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  2
                </span>
                <div>
                  <p className="font-medium text-gray-900">AI Processes Your Content</p>
                  <p className="text-sm text-gray-600">We securely analyze your course materials (takes 1-2 minutes)</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  3
                </span>
                <div>
                  <p className="font-medium text-gray-900">Start Creating</p>
                  <p className="text-sm text-gray-600">Generate flashcards, study guides, and podcasts using your actual course content</p>
                </div>
              </li>
            </ol>
          </div>

          {/* Privacy Note */}
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-xs text-gray-600">
              🔒 <strong>Privacy:</strong> Your course content is processed securely and only accessible to you.
              We use it exclusively to enhance your study experience. You can disconnect anytime.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Skip Setup
          </button>
          <button
            onClick={onContinue}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-medium flex items-center gap-2 shadow-lg"
          >
            Get Started
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
