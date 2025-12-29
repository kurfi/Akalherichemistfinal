

import React, { useState } from 'react';
import { db, logAudit } from '../db/db';
import { Product, Batch } from '../types';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, ChevronDown, ChevronRight, Trash2, X, Calendar, Package, Upload, Download, AlertTriangle, Edit } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../auth/AuthContext';

interface ProductRowProps {
  product: Product;
  expandedRow: number | null;
  setExpandedRow: (id: number | null) => void;
  onOpenBatchModal: (product: Product) => void;
  onEditProduct: (product: Product) => void;
  onEditBatch: (product: Product, batch: Batch) => void;
}

const ProductRow: React.FC<ProductRowProps> = ({ product, expandedRow, setExpandedRow, onOpenBatchModal, onEditProduct, onEditBatch }) => {
  const { currentUser } = useAuth();
  const isExpanded = expandedRow === product.id;

  // Live query for batches ensures UI updates immediately when a batch is added/deleted
  const batches = useLiveQuery(
    () => db.batches.where('productId').equals(product.id!).toArray(),
    [product.id]
  ) || [];

  const now = new Date();
  const totalStock = batches.reduce((acc, b) => acc + b.quantity, 0);
  const validStock = batches.filter(b => new Date(b.expiryDate) > now).reduce((acc, b) => acc + b.quantity, 0);
  const hasExpired = totalStock > validStock;

  const handleDeleteProduct = async () => {
    if (window.confirm(`Are you sure you want to delete "${product.name}"? This will also delete all associated stock batches.`)) {
      try {
        await db.transaction('rw', [db.products, db.batches, db.auditLogs], async () => {
          // Delete all batches for this product
          await db.batches.where('productId').equals(product.id!).delete();
          
          // Delete the product itself
          await db.products.delete(product.id!);
          
          await logAudit(
            'DELETE_PRODUCT',
            `Deleted product: ${product.name} (ID: ${product.id}) and all its batches.`,
            currentUser?.username || 'Unknown'
          );
        });
      } catch (error) {
        console.error("Failed to delete product and its batches:", error);
        alert("Failed to delete product.");
      }
    }
  };

  return (
    <>
      {/* Desktop View (Table Row) */}
      <tr className="hidden md:table-row hover:bg-slate-50 transition-colors border-b border-slate-100 group">
        <td className="p-4 w-10">
          <button onClick={() => setExpandedRow(isExpanded ? null : product.id!)} className="text-slate-400 hover:text-slate-600">
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="p-4 font-medium text-slate-800">{product.name}</td>
        <td className="p-4 text-slate-600 font-mono text-xs">{product.barcode}</td>
        <td className="p-4 text-slate-600">{product.category}</td>
        <td className="p-4 font-medium text-slate-900">₦{product.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td className="p-4">
          <div className="flex flex-col gap-1">
            <span className={`px-2 py-1 rounded-full text-xs font-medium w-fit ${validStock <= product.minStockLevel ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {validStock} Available
            </span>
            {hasExpired && (
              <span className="text-[10px] text-red-500 font-bold px-2 flex items-center gap-1">
                <AlertTriangle className="w-2 h-2" /> {totalStock - validStock} Expired
              </span>
            )}
          </div>
        </td>
        <td className="p-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex justify-end gap-2">
            <button
              onClick={() => onEditProduct(product)}
              className="text-slate-400 hover:text-blue-500"
              title="Edit Product"
            >
              <Edit className="w-4 h-4" />
            </button>
            <button
              onClick={handleDeleteProduct}
              className="text-slate-400 hover:text-red-500"
              title="Delete Product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </td>
      </tr>

      {/* Mobile View (Card Layout) */}
      <tr className="md:hidden border-b border-slate-100">
        <td colSpan={7} className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div onClick={() => setExpandedRow(isExpanded ? null : product.id!)} className="cursor-pointer flex-1">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-emerald-600" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                  {product.name}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-1">{product.barcode} • {product.category}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onEditProduct(product)} className="p-2 text-blue-500 bg-blue-50 rounded-lg"><Edit className="w-4 h-4" /></button>
                <button onClick={handleDeleteProduct} className="p-2 text-red-500 bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg">
              <span className="font-bold text-slate-900">₦{product.price.toLocaleString()}</span>
              <div className="flex flex-col items-end gap-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${validStock <= product.minStockLevel ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {validStock} In Stock
                </span>
                {hasExpired && (
                  <span className="text-[9px] text-red-500 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-2 h-2" /> {totalStock - validStock} Expired
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
      </tr>

      {isExpanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="p-2 md:p-4 shadow-inner">
            <div className="mb-3 flex justify-between items-center bg-white p-3 rounded-lg border border-slate-200">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-500" />
                <h4 className="font-semibold text-sm text-slate-700">Batch Inventory</h4>
              </div>
              <button
                onClick={() => onOpenBatchModal(product)}
                className="text-xs bg-emerald-50 text-emerald-600 border border-emerald-200 px-3 py-1.5 rounded-md hover:bg-emerald-100 font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Batch
              </button>
            </div>

            {batches.length > 0 ? (
              <div className="overflow-x-auto">
                {/* Desktop Batch Table */}
                <table className="hidden md:table w-full text-sm text-left bg-white rounded-lg overflow-hidden border border-slate-200">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="py-2 px-4 font-medium">Batch #</th>
                      <th className="py-2 px-4 font-medium">Expiry Date</th>
                      <th className="py-2 px-4 font-medium">Cost Price</th>
                      <th className="py-2 px-4 font-medium">Selling Price</th>
                      <th className="py-2 px-4 font-medium">Quantity</th>
                      <th className="py-2 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {batches.map(b => {
                      const isExpired = new Date(b.expiryDate) <= now;
                      return (
                        <tr key={b.id} className={isExpired ? 'bg-red-50/50' : ''}>
                          <td className="py-2 px-4 font-mono text-xs">{b.batchNumber}</td>
                          <td className="py-2 px-4 flex items-center gap-2">
                            {format(new Date(b.expiryDate), 'MMM dd, yyyy')}
                            {isExpired && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase">Expired</span>}
                          </td>
                          <td className="py-2 px-4 text-slate-500">₦{b.costPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                          <td className="py-2 px-4 text-emerald-600 font-medium">
                            {b.sellingPrice ? `₦${b.sellingPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td className="py-2 px-4 font-medium">
                            <span className={isExpired && b.quantity > 0 ? 'text-red-600' : ''}>
                              {b.quantity}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-right">
                            <div className="flex justify-end gap-3">
                              <button
                                onClick={() => onEditBatch(product, b)}
                                className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (confirm('Delete this batch?')) {
                                    await db.batches.delete(b.id!);
                                    await logAudit(
                                      'DELETE_BATCH',
                                      `Deleted batch ${b.batchNumber} for product ${product.name}`,
                                      currentUser?.username || 'Unknown'
                                    );
                                  }
                                }}
                                className="text-xs text-red-400 hover:text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile Batch List */}
                <div className="md:hidden space-y-2">
                   {batches.map(b => {
                      const isExpired = new Date(b.expiryDate) <= now;
                      return (
                        <div key={b.id} className={`bg-white p-3 rounded-lg border ${isExpired ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                          <div className="flex justify-between mb-2">
                            <span className="font-mono text-[10px] text-slate-500">{b.batchNumber}</span>
                            {isExpired && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase">Expired</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                            <div>
                              <p className="text-slate-400">Expiry</p>
                              <p className="font-medium">{format(new Date(b.expiryDate), 'MMM dd, yyyy')}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-right">Qty</p>
                              <p className={`font-bold text-right ${isExpired && b.quantity > 0 ? 'text-red-600' : ''}`}>{b.quantity}</p>
                            </div>
                            <div>
                              <p className="text-slate-400">Cost</p>
                              <p className="font-medium">₦{b.costPrice.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 text-right">Price</p>
                              <p className="font-bold text-right text-emerald-600">₦{b.sellingPrice?.toLocaleString() || '-'}</p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-4 pt-2 border-t border-slate-100">
                             <button onClick={() => onEditBatch(product, b)} className="text-xs text-blue-500 font-bold">EDIT</button>
                             <button 
                                onClick={async () => {
                                  if (confirm('Delete this batch?')) {
                                    await db.batches.delete(b.id!);
                                    await logAudit('DELETE_BATCH', `Deleted batch ${b.batchNumber}`, currentUser?.username || 'Unknown');
                                  }
                                }} 
                                className="text-xs text-red-500 font-bold"
                              >DELETE</button>
                          </div>
                        </div>
                      );
                   })}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-slate-400 bg-white rounded-lg border border-slate-200 border-dashed">
                No batches found. Add stock to this product.
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
};

const Inventory: React.FC = () => {
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isEditProductModalOpen, setIsEditProductModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isEditBatchModalOpen, setIsEditBatchModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Forms State
  const [newProduct, setNewProduct] = useState<Partial<Product>>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState<Product | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [batchForm, setBatchForm] = useState({
    batchNumber: '',
    quantity: '',
    expiryDate: '',
    costPrice: '',
    sellingPrice: ''
  });

  // Utility to generate a simple unique batch number
  const generateBatchNumber = () => {
    const timestamp = format(new Date(), 'yyyyMMddHHmmss');
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 random chars
    return `BN-${timestamp}-${randomSuffix}`;
  };

  const products = useLiveQuery(async () => {
    if (searchTerm) {
      return await db.products
        .where('name')
        .startsWithIgnoreCase(searchTerm)
        .or('barcode').equals(searchTerm)
        .toArray();
    }
    return await db.products.toArray();
  }, [searchTerm]);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newProduct.name && newProduct.price) {
      const generatedBarcode = Math.floor(10000000 + Math.random() * 90000000).toString();

      await db.products.add({
        name: newProduct.name,
        barcode: newProduct.barcode || generatedBarcode,
        category: newProduct.category || 'General',
        price: Number(newProduct.price),
        minStockLevel: Number(newProduct.minStockLevel || 10)
      });
      setIsProductModalOpen(false);
      setNewProduct({});
    }
  };

  const handleOpenBatchModal = (product: Product) => {
    setSelectedProductForBatch(product);
    setBatchForm({
      batchNumber: generateBatchNumber(), // Automatically generate batch number
      quantity: '',
      expiryDate: '',
      costPrice: '',
      sellingPrice: product.price.toString()
    });
    setIsBatchModalOpen(true);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProductForBatch && batchForm.batchNumber && batchForm.quantity && batchForm.expiryDate) {
      const sellingPrice = parseFloat(batchForm.sellingPrice) || 0;

      await db.batches.add({
        productId: selectedProductForBatch.id!,
        batchNumber: batchForm.batchNumber,
        quantity: parseInt(batchForm.quantity),
        expiryDate: new Date(batchForm.expiryDate),
        costPrice: parseFloat(batchForm.costPrice) || 0,
        sellingPrice: sellingPrice
      });

      // Update product selling price to reflect latest batch
      if (sellingPrice > 0) {
        await db.products.update(selectedProductForBatch.id!, {
          price: sellingPrice
        });
      }

      setIsBatchModalOpen(false);
    }
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsEditProductModalOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProduct && editingProduct.id) {
      await db.products.update(editingProduct.id, {
        name: editingProduct.name,
        category: editingProduct.category,
        price: editingProduct.price,
        minStockLevel: editingProduct.minStockLevel,
        barcode: editingProduct.barcode
      });
      setIsEditProductModalOpen(false);
      setEditingProduct(null);
    }
  };

  const handleOpenEditBatchModal = (product: Product, batch: Batch) => {
    setSelectedProductForBatch(product);
    setEditingBatch(batch);
    setBatchForm({
      batchNumber: batch.batchNumber,
      quantity: batch.quantity.toString(),
      expiryDate: format(new Date(batch.expiryDate), 'yyyy-MM-dd'),
      costPrice: batch.costPrice.toString(),
      sellingPrice: batch.sellingPrice ? batch.sellingPrice.toString() : ''
    });
    setIsEditBatchModalOpen(true);
  };

  const handleUpdateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingBatch && editingBatch.id && selectedProductForBatch) {
      const sellingPrice = parseFloat(batchForm.sellingPrice) || 0;

      await db.batches.update(editingBatch.id, {
        batchNumber: batchForm.batchNumber,
        quantity: parseInt(batchForm.quantity),
        expiryDate: new Date(batchForm.expiryDate),
        costPrice: parseFloat(batchForm.costPrice) || 0,
        sellingPrice: sellingPrice
      });

      // Update product selling price if needed
      if (sellingPrice > 0) {
        await db.products.update(selectedProductForBatch.id!, {
          price: sellingPrice
        });
      }

      setIsEditBatchModalOpen(false);
      setEditingBatch(null);
    }
  };

  const downloadTemplate = () => {
    const headers = "Name,Barcode,Category,Price,MinStockLevel\nPanadol Extra,123456789,Pain Relief,1500,20";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'products_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const productsToAdd: Partial<Product>[] = [];

      // Skip header row (index 0)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple CSV parsing (handles commas)
        // Note: Does not handle quoted strings containing commas perfectly
        const [name, barcode, category, price, minStockLevel] = line.split(',');

        if (name && price) {
          productsToAdd.push({
            name: name.trim(),
            barcode: barcode?.trim() || Math.floor(10000000 + Math.random() * 90000000).toString(),
            category: category?.trim() || 'General',
            price: parseFloat(price),
            minStockLevel: parseInt(minStockLevel) || 10
          });
        }
      }

      if (productsToAdd.length > 0) {
        try {
          await db.products.bulkAdd(productsToAdd as Product[]);
          alert(`Successfully imported ${productsToAdd.length} products.`);
          setIsBulkModalOpen(false);
        } catch (error) {
          console.error("Import failed", error);
          alert("Import failed. Please check your CSV format.");
        }
      } else {
        alert("No valid products found in file.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-800">Inventory</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setIsBulkModalOpen(true)}
            className="bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-200 flex items-center gap-2 shadow-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={() => setIsProductModalOpen(true)}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search products by name or barcode..."
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="hidden md:table-header-group">
              <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                <th className="p-4 w-10"></th>
                <th className="p-4 font-medium">Product Name</th>
                <th className="p-4 font-medium">Barcode</th>
                <th className="p-4 font-medium">Category</th>
                <th className="p-4 font-medium">Price</th>
                <th className="p-4 font-medium">Stock</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products?.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  expandedRow={expandedRow}
                  setExpandedRow={setExpandedRow}
                  onOpenBatchModal={handleOpenBatchModal}
                  onEditProduct={handleEditProduct}
                  onEditBatch={handleOpenEditBatchModal}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">New Product</h2>
              <button onClick={() => setIsProductModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Panadol Extra"
                  required
                  value={newProduct.name || ''}
                  onChange={e => setNewProduct({ ...newProduct, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="e.g. Pain Relief"
                  value={newProduct.category || ''}
                  onChange={e => setNewProduct({ ...newProduct, category: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Price (₦)</label>
                  <input
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    type="number"
                    placeholder="0.00"
                    required
                    value={newProduct.price || ''}
                    onChange={e => setNewProduct({ ...newProduct, price: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Stock Alert</label>
                  <input
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    type="number"
                    placeholder="10"
                    value={newProduct.minStockLevel || ''}
                    onChange={e => setNewProduct({ ...newProduct, minStockLevel: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Save Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Batch Modal */}
      {isBatchModalOpen && selectedProductForBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Add Stock Batch</h2>
                <p className="text-sm text-slate-500">{selectedProductForBatch.name}</p>
              </div>
              <button onClick={() => setIsBatchModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveBatch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Batch Number</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none bg-slate-100 cursor-not-allowed"
                  placeholder="Automatically Generated"
                  readOnly // Make it read-only
                  value={batchForm.batchNumber}
                  onChange={e => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="0"
                    required
                    value={batchForm.quantity}
                    onChange={e => setBatchForm({ ...batchForm, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₦)</label>
                  <input
                    type="number"
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    placeholder="0.00"
                    value={batchForm.costPrice}
                    onChange={e => setBatchForm({ ...batchForm, costPrice: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (₦)</label>
                <input
                  type="number"
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="0.00"
                  required
                  value={batchForm.sellingPrice}
                  onChange={e => setBatchForm({ ...batchForm, sellingPrice: e.target.value })}
                />
                <p className="text-xs text-slate-500 mt-1">This will update the product's current selling price.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="date"
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                    value={batchForm.expiryDate}
                    onChange={e => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsBatchModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Add Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {isEditProductModalOpen && editingProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">Edit Product</h2>
              <button onClick={() => setIsEditProductModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUpdateProduct} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                  value={editingProduct.name || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={editingProduct.category || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Barcode</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={editingProduct.barcode || ''}
                  onChange={e => setEditingProduct({ ...editingProduct, barcode: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Default Selling Price (₦)</label>
                  <input
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    type="number"
                    step="0.01"
                    required
                    value={editingProduct.price || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Min Stock Alert</label>
                  <input
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    type="number"
                    value={editingProduct.minStockLevel || ''}
                    onChange={e => setEditingProduct({ ...editingProduct, minStockLevel: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsEditProductModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Update Product</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Batch Modal */}
      {isEditBatchModalOpen && selectedProductForBatch && editingBatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">Edit Batch</h2>
                <p className="text-sm text-slate-500">{selectedProductForBatch.name}</p>
              </div>
              <button onClick={() => setIsEditBatchModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleUpdateBatch} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Batch Number</label>
                <input
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={batchForm.batchNumber}
                  onChange={e => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                    value={batchForm.quantity}
                    onChange={e => setBatchForm({ ...batchForm, quantity: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost Price (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={batchForm.costPrice}
                    onChange={e => setBatchForm({ ...batchForm, costPrice: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Selling Price (₦)</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border border-slate-300 p-2 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                  value={batchForm.sellingPrice}
                  onChange={e => setBatchForm({ ...batchForm, sellingPrice: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="date"
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    required
                    value={batchForm.expiryDate}
                    onChange={e => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setIsEditBatchModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium">Update Batch</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-slate-800">Bulk Import Products</h2>
              <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-medium text-slate-800 mb-2 flex items-center gap-2"><Download className="w-4 h-4" /> Step 1: Get Template</h3>
                <p className="text-sm text-slate-500 mb-3">Download the CSV template to see the required format.</p>
                <button
                  onClick={downloadTemplate}
                  className="text-sm text-emerald-600 font-medium hover:underline"
                >
                  Download Template.csv
                </button>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h3 className="font-medium text-slate-800 mb-2 flex items-center gap-2"><Upload className="w-4 h-4" /> Step 2: Upload CSV</h3>
                <p className="text-sm text-slate-500 mb-3">Select your filled CSV file to import.</p>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleBulkImport}
                  className="block w-full text-sm text-slate-500
                              file:mr-4 file:py-2 file:px-4
                              file:rounded-full file:border-0
                              file:text-sm file:font-semibold
                              file:bg-emerald-50 file:text-emerald-700
                              hover:file:bg-emerald-100
                            "
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsBulkModalOpen(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
