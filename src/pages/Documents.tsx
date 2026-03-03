import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Upload, Download, Check, X, Eye, FileText, Search, Filter, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Documents() {
  const { user, token } = useAuth();
  const [documents, setDocuments] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('General');
  const [tags, setTags] = useState('');
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const fetchDocuments = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('search', searchQuery);
      if (filterStatus) queryParams.append('status', filterStatus);
      if (filterCategory) queryParams.append('category', filterCategory);

      const res = await fetch(`/api/documents?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [token, searchQuery, filterStatus, filterCategory]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('category', category);
    formData.append('tags', tags);

    try {
      setIsUploading(true);
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        setFile(null);
        setTitle('');
        setTags('');
        fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleApproval = async (id: number, action: 'approve' | 'reject') => {
    try {
      const res = await fetch(`/api/documents/${id}/${action}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ comments: `${action.toUpperCase()} by ${user?.name}` }),
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      const res = await fetch(`/api/documents/${id}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchDocuments();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const canApprove = user?.role === 'Admin' || user?.role === 'Department Manager' || user?.role === 'Approver';

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">Upload New Document</h3>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Document Title</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                <option>General</option>
                <option>Policy</option>
                <option>Invoice</option>
                <option>Contract</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tags (comma separated)</label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">File</label>
              <input
                type="file"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUploading || !file}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <Upload className="-ml-1 mr-2 h-5 w-5" aria-hidden="true" />
              {isUploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>

      {/* Pending Approvals List */}
      {pendingApprovals.length > 0 && (
        <div className="bg-white shadow rounded-lg overflow-hidden border-l-4 border-yellow-400">
          <div className="px-4 py-5 sm:px-6 border-b border-gray-200 bg-yellow-50">
            <h3 className="text-lg leading-6 font-medium text-yellow-800">Action Required: Pending Approvals</h3>
          </div>
          <ul className="divide-y divide-gray-200">
            {pendingApprovals.map((doc) => (
              <li key={doc.id} className="p-4 hover:bg-yellow-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center min-w-0 gap-4">
                    <div className="h-10 w-10 rounded-lg bg-yellow-100 flex items-center justify-center text-yellow-600">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate">{doc.title}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <span>{doc.uploader_name}</span>
                        <span>&bull;</span>
                        <span>{doc.department_name}</span>
                        <span>&bull;</span>
                        <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(doc.id, doc.original_name)}
                        className="p-1 text-gray-400 hover:text-indigo-600"
                        title="Download"
                      >
                        <Download className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => handleApproval(doc.id, 'approve')}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                      >
                        <Check className="-ml-0.5 mr-1.5 h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleApproval(doc.id, 'reject')}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        <X className="-ml-0.5 mr-1.5 h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Document List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg leading-6 font-medium text-gray-900">Document Repository</h3>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-2 border"
              />
            </div>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
            >
              <option value="">All Categories</option>
              <option value="General">General</option>
              <option value="Policy">Policy</option>
              <option value="Invoice">Invoice</option>
              <option value="Contract">Contract</option>
            </select>
          </div>
        </div>
        <ul className="divide-y divide-gray-200">
          {documents.map((doc) => (
            <li key={doc.id} className="p-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0 gap-4">
                  <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-indigo-600 truncate">{doc.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span>{doc.uploader_name}</span>
                      <span>&bull;</span>
                      <span>{doc.department_name}</span>
                      <span>&bull;</span>
                      <span>{format(new Date(doc.created_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    doc.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    doc.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {doc.status}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDownload(doc.id, doc.original_name)}
                      className="p-1 text-gray-400 hover:text-indigo-600"
                      title="Download"
                    >
                      <Download className="h-5 w-5" />
                    </button>

                    {(user?.role === 'Admin' || user?.id === doc.uploader_id) && (
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                    
                    {doc.canApprove && (
                      <>
                        <button
                          onClick={() => handleApproval(doc.id, 'approve')}
                          className="p-1 text-gray-400 hover:text-green-600"
                          title="Approve"
                        >
                          <Check className="h-5 w-5" />
                        </button>
                        <button
                          onClick={() => handleApproval(doc.id, 'reject')}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Reject"
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
          {documents.length === 0 && (
            <li className="p-8 text-center text-gray-500">
              No documents found.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
