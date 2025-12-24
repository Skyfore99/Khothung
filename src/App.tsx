// @ts-nocheck
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Save,
  Settings,
  Database,
  History,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Copy,
  Trash2,
  PackagePlus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Wifi,
  WifiOff,
  Package,
  ClipboardPaste,
  MapPin,
  Edit3,
  RefreshCw,
  Filter,
  X,
  ChevronDown,
  Lock,
  Unlock,
  KeyRound,
  LayoutGrid,
  Box,
  QrCode,
  Scan,
  LogOut,
  CheckSquare,
  Square,
  Camera,
  RefreshCcw,
} from "lucide-react";

// @ts-ignore
import QrScanner from "react-qr-scanner";

// --- MÃ SCRIPT GOOGLE SHEET (GIỮ NGUYÊN V2.7) ---
const SCRIPT_CODE = `
function doGet(e) {
  var doc = SpreadsheetApp.getActiveSpreadsheet();
  var history = [];

  // 1. Đọc Lịch sử
  function readFromSheet(sheetName) {
    var sheet = doc.getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 16).getValues();
      for (var i = 0; i < data.length; i++) {
        var r = data[i];
        var clean = function(val) { return String(val).startsWith("'") ? String(val).substring(1) : String(val); };
        var dateVal = r[0];
        if (dateVal instanceof Date) { dateVal = Utilities.formatDate(dateVal, Session.getScriptTimeZone(), "yyyy-MM-dd"); } 
        else { dateVal = clean(dateVal); }

        history.push({
          date: dateVal, type: r[1], sku: clean(r[2]), style: clean(r[3]), color: clean(r[4]), 
          unit: clean(r[5]), po: clean(r[6]), shipdate: clean(r[7]), poQty: r[8], size: clean(r[9]), 
          masterBoxQty: r[10], cartonSize: r[11], cartonNC: r[12], quantity: r[13], 
          locationOrReceiver: clean(r[14]), note: clean(r[15])
        });
      }
    }
  }
  readFromSheet('NhapKho');
  readFromSheet('XuatKho');
  history.sort(function(a, b) { return new Date(b.date) - new Date(a.date); });

  // 2. Đọc Danh mục
  var sheetProducts = doc.getSheetByName('DanhMuc');
  var products = [];
  if (sheetProducts && sheetProducts.getLastRow() > 1) {
    var pData = sheetProducts.getRange(2, 1, sheetProducts.getLastRow() - 1, 12).getValues();
    for (var i = 0; i < pData.length; i++) {
      var r = pData[i];
      var clean = function(val) { return String(val).startsWith("'") ? String(val).substring(1) : String(val); };
      products.push({
        sku: clean(r[0]), style: clean(r[1]), color: clean(r[2]), unit: clean(r[3]), 
        po: clean(r[4]), shipdate: clean(r[5]), poQty: r[6], size: clean(r[7]), 
        masterBoxQty: r[8], cartonSize: r[9], cartonNC: r[10], location: clean(r[11])
      });
    }
  }

  // 3. Đọc Cấu hình (Mật khẩu Admin)
  var sheetConfig = doc.getSheetByName('CauHinh');
  var adminPassword = "123456"; // Mặc định
  if (sheetConfig) {
      var val = sheetConfig.getRange(1, 1).getValue();
      if (val) adminPassword = val.toString();
  }

  // 4. Đọc Danh sách Vị trí
  var sheetLocations = doc.getSheetByName('CauHinhViTri');
  var locations = [];
  if (sheetLocations && sheetLocations.getLastRow() > 0) {
      var lData = sheetLocations.getRange(1, 1, sheetLocations.getLastRow(), 1).getValues();
      for (var i = 0; i < lData.length; i++) {
         if (lData[i][0]) locations.push(String(lData[i][0]));
      }
  }

  return ContentService.createTextOutput(JSON.stringify({ 
    status: "success", 
    history: history, 
    products: products,
    settings: { password: adminPassword },
    locations: locations
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000); 
  try {
    var doc = SpreadsheetApp.getActiveSpreadsheet();
    var data = JSON.parse(e.postData.contents);
    var action = data.action;

    if (action === 'transaction') {
      var sheetName = data.type === 'NHẬP' ? 'NhapKho' : 'XuatKho';
      var sheet = doc.getSheetByName(sheetName);
      if (!sheet) {
        sheet = doc.insertSheet(sheetName);
        sheet.appendRow(['Ngày', 'Loại', 'Mã hàng', 'Style', 'Màu', 'Đơn', 'PO', 'Shipdate', 'PO Qty', 'Size', 'M.Box', 'KT Thùng', 'NC Thùng', 'SL', 'Vị trí/Nhóm', 'Ghi chú']);
      }
      sheet.appendRow([
        data.date, data.type, "'"+data.sku, "'"+data.style, "'"+data.color, "'"+data.unit, 
        "'"+data.po, "'"+data.shipdate, "'"+data.poQty, "'"+data.size, "'"+data.masterBoxQty, 
        "'"+data.cartonSize, "'"+data.cartonNC, data.quantity, "'"+data.locationOrReceiver, "'"+data.note
      ]);
      if (data.type === 'NHẬP' && data.locationOrReceiver) {
        updateLocationInSheet(doc, data.sku, data.locationOrReceiver);
      }
    }
    else if (action === 'add_product' || action === 'bulk_add_products') {
      var sheet = doc.getSheetByName('DanhMuc');
      if (!sheet) {
        sheet = doc.insertSheet('DanhMuc');
        sheet.appendRow(['Mã hàng', 'Style', 'Màu', 'Đơn', 'PO', 'Shipdate', 'PO Qty', 'Size', 'M.Box', 'KT Thùng', 'NC Thùng', 'Vị trí']);
      }
      var items = action === 'add_product' ? [data] : data.items;
      var newRows = [];
      var currentData = [];
      if (sheet.getLastRow() > 1) { currentData = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues(); }
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var isDuplicate = false;
        for (var j = 0; j < currentData.length; j++) {
           var row = currentData[j];
           if (String(row[0]).replace(/'/g,"") == item.sku && String(row[1]).replace(/'/g,"") == item.style && String(row[4]).replace(/'/g,"") == item.po && String(row[7]).replace(/'/g,"") == item.size) {
               isDuplicate = true; break;
           }
        }
        if (!isDuplicate) {
           newRows.push([ "'"+item.sku, "'"+item.style, "'"+item.color, "'"+item.unit, "'"+item.po, "'"+item.shipdate, "'"+item.poQty, "'"+item.size, "'"+item.masterBoxQty, "'"+item.cartonSize, "'"+item.cartonNC, "'"+item.location ]);
           currentData.push(["'"+item.sku, "'"+item.style, "", "", "'"+item.po, "", "", "'"+item.size]); 
        }
      }
      if (newRows.length > 0) { sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 12).setValues(newRows); }
      return ContentService.createTextOutput(JSON.stringify({"result":"success", "added": newRows.length})).setMimeType(ContentService.MimeType.JSON);
    }
    else if (action === 'delete_product') {
      var sheet = doc.getSheetByName('DanhMuc');
      if (sheet) {
        var values = sheet.getDataRange().getValues();
        for (var i = 1; i < values.length; i++) {
           if (String(values[i][0]).replace(/'/g,"") == data.sku && String(values[i][4]).replace(/'/g,"") == data.po && String(values[i][7]).replace(/'/g,"") == data.size) {
               sheet.deleteRow(i + 1); break;
           }
        }
      }
    }
    else if (action === 'update_location_history') {
      var sheet = doc.getSheetByName('NhapKho');
      if (sheet) {
        var values = sheet.getDataRange().getValues();
        for (var i = 1; i < values.length; i++) {
           if (String(values[i][2]).replace(/'/g,"") == data.sku && 
               String(values[i][6]).replace(/'/g,"") == data.po && 
               String(values[i][9]).replace(/'/g,"") == data.size &&
               String(values[i][14]).replace(/'/g,"") == data.oldLocation) {
               sheet.getRange(i + 1, 15).setValue("'"+data.newLocation);
           }
        }
      }
      updateLocationInSheet(doc, data.sku, data.newLocation);
    }
    else if (action === 'update_password') {
      var sheet = doc.getSheetByName('CauHinh');
      if (!sheet) { 
        sheet = doc.insertSheet('CauHinh'); 
        sheet.hideSheet();
      }
      sheet.getRange(1, 1).setValue(data.password);
    }
    else if (action === 'update_locations') {
      var sheet = doc.getSheetByName('CauHinhViTri');
      if (!sheet) { 
         sheet = doc.insertSheet('CauHinhViTri');
         sheet.hideSheet();
      }
      sheet.clear();
      var locs = data.locations;
      if (locs && locs.length > 0) {
         var rows = locs.map(function(l) { return [l]; });
         sheet.getRange(1, 1, rows.length, 1).setValues(rows);
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({"result":"success"})).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({"result":"error", "error": e})).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function updateLocationInSheet(doc, sku, newLoc) {
  var sheet = doc.getSheetByName('DanhMuc');
  if (sheet) {
    var found = sheet.createTextFinder(sku).matchEntireCell(true).findNext();
    if (found) { sheet.getRange(found.getRow(), 12).setValue("'"+newLoc); }
  }
}
`;

// --- HELPERS ---
const normalize = (val) =>
  val === null || val === undefined ? "" : String(val).trim().toLowerCase();

const calculateStockByLocation = (product, history) => {
  const itemHistory = history.filter(
    (h) =>
      normalize(h.sku) === normalize(product.sku) &&
      normalize(h.style) === normalize(product.style) &&
      normalize(h.color) === normalize(product.color) &&
      normalize(h.size) === normalize(product.size) &&
      normalize(h.po) === normalize(product.po)
  );
  const locationMap = {};
  itemHistory.forEach((h) => {
    const loc = h.locationOrReceiver || "Chưa set";
    if (!locationMap[loc]) locationMap[loc] = 0;
    const qty = parseInt(h.quantity) || 0;
    if (h.type === "NHẬP") {
      locationMap[loc] += qty;
    } else {
      locationMap[loc] -= qty;
    }
  });
  return locationMap;
};

const formatDateDisplay = (dateString) => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date);
  } catch {
    return dateString;
  }
};

const useNetworkStatus = (showNotification) => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showNotification("success", "Đã kết nối lại mạng!");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showNotification("error", "Mất kết nối Internet!");
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [showNotification]);
  return isOnline;
};

// --- COMPONENTS ---

const ConfigurableSelect = ({
  label,
  value,
  onChange,
  options,
  onOptionsChange,
  placeholder,
  required = false,
  allowAdd = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleAddOption = () => {
    if (inputValue.trim() && !options.includes(inputValue.trim())) {
      const newOptions = [...options, inputValue.trim()];
      if (onOptionsChange) onOptionsChange(newOptions);
      onChange(inputValue.trim());
      setInputValue("");
      setIsOpen(false);
    }
  };

  const handleRemoveOption = (e, optionToRemove) => {
    e.stopPropagation();
    if (confirm(`Xóa mục "${optionToRemove}" khỏi danh sách?`)) {
      const newOptions = options.filter((opt) => opt !== optionToRemove);
      if (onOptionsChange) onOptionsChange(newOptions);
      if (value === optionToRemove) onChange("");
    }
  };

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(value.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium mb-1 text-gray-700">
        {label}
      </label>
      <div className="relative w-full">
        <input
          type="text"
          required={required}
          className="w-full p-2 pr-8 rounded text-gray-900 text-base border border-gray-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-bold"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
        />
        <div
          className="absolute right-2 top-2.5 cursor-pointer text-gray-500 hover:text-gray-700"
          onClick={() => setIsOpen(!isOpen)}
        >
          <ChevronDown size={18} />
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {allowAdd && (
            <div className="p-2 border-b border-gray-100 flex gap-2 sticky top-0 bg-white">
              <input
                type="text"
                className="flex-1 p-2 text-base text-gray-900 border border-gray-300 rounded focus:border-indigo-500 outline-none placeholder:text-gray-400"
                placeholder="Thêm mới..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddOption()}
              />
              <button
                type="button"
                onClick={handleAddOption}
                className="p-1.5 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200"
              >
                <Plus size={18} />
              </button>
            </div>
          )}
          <ul className="py-1">
            {filteredOptions.length === 0 && !value && (
              <li className="px-3 py-2 text-sm text-gray-400 text-center italic">
                {allowAdd
                  ? "Danh sách trống"
                  : "Không tìm thấy trong danh sách"}
              </li>
            )}
            {filteredOptions.map((opt, idx) => (
              <li
                key={idx}
                className={`px-3 py-2 text-base text-gray-800 hover:bg-indigo-50 cursor-pointer flex justify-between items-center group ${
                  value === opt ? "bg-indigo-50 text-indigo-700 font-bold" : ""
                }`}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
              >
                <span>{opt}</span>
                {allowAdd && (
                  <button
                    onClick={(e) => handleRemoveOption(e, opt)}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                  >
                    <X size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const Header = ({
  isOnline,
  scriptUrl,
  onSync,
  isSyncing,
  syncStatus,
  isAdmin,
  onToggleScanner,
}) => (
  <header className="bg-slate-800 text-white p-4 shadow-lg sticky top-0 z-50">
    <div className="container mx-auto flex justify-between items-center">
      <div className="flex items-center space-x-2">
        <Database className="w-6 h-6 text-blue-400" />
        <h1 className="text-xl font-bold hidden sm:block">Quản Lý Kho Pro</h1>
        <h1 className="text-xl font-bold sm:hidden">QL Kho</h1>
        {isAdmin && (
          <span className="text-[10px] bg-red-600 px-2 py-0.5 rounded font-bold ml-2 animate-pulse">
            ADMIN
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* NÚT SCAN QR */}
        <button
          onClick={onToggleScanner}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all active:scale-95 border border-indigo-400"
        >
          <QrCode size={16} />
          <span className="hidden sm:inline font-bold">Quét QR</span>
        </button>

        {scriptUrl && isOnline && (
          <>
            {syncStatus === "syncing" && (
              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-200 bg-blue-900/50 px-3 py-1 rounded-full border border-blue-500/30">
                <RefreshCw size={12} className="animate-spin" />
                <span className="hidden sm:inline">Syncing...</span>
              </div>
            )}
            {syncStatus === "success" && (
              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-emerald-200 bg-emerald-900/50 px-3 py-1 rounded-full border border-emerald-500/30">
                <CheckCircle size={12} />
                <span className="hidden sm:inline">Done</span>
              </div>
            )}
            {syncStatus === "error" && (
              <div className="flex items-center gap-1 text-[10px] sm:text-xs text-red-200 bg-red-900/50 px-3 py-1 rounded-full border border-red-500/30">
                <AlertCircle size={12} />
                <span className="hidden sm:inline">Error</span>
              </div>
            )}
          </>
        )}
        <div
          className={`text-xs px-2 py-1 sm:px-3 rounded-full flex items-center gap-1 transition-colors ${
            !isOnline
              ? "bg-red-500"
              : scriptUrl
              ? "bg-green-600"
              : "bg-gray-500"
          }`}
        >
          {isOnline ? (
            scriptUrl ? (
              <Wifi size={14} />
            ) : (
              <div className="w-2 h-2 rounded-full bg-gray-300"></div>
            )
          ) : (
            <WifiOff size={14} />
          )}
        </div>
        {scriptUrl && (
          <button
            onClick={() => onSync(false)}
            disabled={isSyncing || !isOnline}
            className={`text-xs px-2 py-1 sm:px-3 rounded-full flex items-center gap-1 font-bold transition-all ${
              isSyncing
                ? "bg-yellow-500 text-black cursor-wait"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          </button>
        )}
      </div>
    </div>
  </header>
);

const NotificationToast = ({ notification }) => {
  if (!notification.message) return null;
  return (
    <div
      className={`fixed top-20 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 text-white animate-fade-in-down ${
        notification.type === "error" ? "bg-red-500" : "bg-green-600"
      }`}
    >
      {notification.type === "error" ? (
        <AlertCircle size={20} />
      ) : (
        <CheckCircle size={20} />
      )}
      <span>{notification.message}</span>
    </div>
  );
};

const NavTabs = ({ activeTab, setActiveTab }) => {
  const tabs = [
    {
      id: "input",
      label: "Nhập Kho",
      icon: <ArrowDownLeft size={20} />,
      color: "blue",
    },
    {
      id: "output",
      label: "Xuất Kho",
      icon: <ArrowUpRight size={20} />,
      color: "orange",
    },
    {
      id: "map",
      label: "Sơ Đồ Kho",
      icon: <LayoutGrid size={20} />,
      color: "purple",
    },
    {
      id: "inventory",
      label: "List Tồn",
      icon: <Package size={20} />,
      color: "emerald",
    },
    {
      id: "catalog",
      label: "Dữ Liệu Hàng",
      icon: <PackagePlus size={20} />,
      color: "indigo",
    },
  ];
  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex-1 min-w-[90px] flex items-center justify-center space-x-2 px-2 sm:px-3 py-3 rounded-lg transition-all shadow-sm ${
            activeTab === tab.id
              ? `bg-${tab.color}-600 text-white ring-2 ring-${tab.color}-300 ring-offset-1`
              : "bg-white hover:bg-gray-50 text-gray-600"
          } ${
            activeTab === tab.id && tab.id === "input"
              ? "!bg-blue-600 !ring-blue-300"
              : ""
          } ${
            activeTab === tab.id && tab.id === "output"
              ? "!bg-orange-500 !ring-orange-300"
              : ""
          } ${
            activeTab === tab.id && tab.id === "inventory"
              ? "!bg-emerald-600 !ring-emerald-300"
              : ""
          } ${
            activeTab === tab.id && tab.id === "catalog"
              ? "!bg-indigo-600 !ring-indigo-300"
              : ""
          } ${
            activeTab === tab.id && tab.id === "map"
              ? "!bg-purple-600 !ring-purple-300"
              : ""
          }`}
        >
          {tab.icon}
          <span className="font-semibold hidden sm:inline text-sm">
            {tab.label}
          </span>
          <span className="font-semibold sm:hidden text-xs">
            {tab.label.split(" ")[0]}
          </span>
        </button>
      ))}
      <button
        onClick={() => setActiveTab("history")}
        className={`flex-none px-3 py-3 rounded-lg transition-all shadow-sm ${
          activeTab === "history"
            ? "bg-gray-700 text-white"
            : "bg-white hover:bg-gray-50 text-gray-600"
        }`}
      >
        <History size={20} />
      </button>
      <button
        onClick={() => setActiveTab("settings")}
        className={`flex-none px-3 py-3 rounded-lg transition-all shadow-sm ${
          activeTab === "settings"
            ? "bg-gray-700 text-white"
            : "bg-white hover:bg-gray-50 text-gray-600"
        }`}
      >
        <Settings size={20} />
      </button>
      <button
        onClick={() => setActiveTab("help")}
        className={`flex-none px-3 py-3 rounded-lg transition-all shadow-sm ${
          activeTab === "help"
            ? "bg-yellow-500 text-white"
            : "bg-white hover:bg-gray-50 text-gray-600"
        }`}
      >
        <FileSpreadsheet size={20} />
      </button>
    </div>
  );
};

// --- WAREHOUSE VISUAL VIEW (Sơ đồ kho) ---
const WarehouseVisualView = ({
  mapData,
  selectedLoc,
  onSelectLoc,
  onNavigateExport,
  partners,
  onBatchExport,
}) => {
  const locationKeys = Object.keys(mapData).sort();
  const [selectedItems, setSelectedItems] = useState([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [batchQuantities, setBatchQuantities] = useState({});
  const [batchPartner, setBatchPartner] = useState("");
  const [batchDate, setBatchDate] = useState(
    new Date().toISOString().split("T")[0]
  );

  // Reset selected items when modal opens/closes
  useEffect(() => {
    setSelectedItems([]);
    setIsBatchMode(false);
    setBatchQuantities({});
  }, [selectedLoc]);

  const toggleSelection = (item) => {
    const itemKey = `${item.sku}-${item.po}-${item.size}`;
    if (selectedItems.find((i) => `${i.sku}-${i.po}-${i.size}` === itemKey)) {
      setSelectedItems(
        selectedItems.filter((i) => `${i.sku}-${i.po}-${i.size}` !== itemKey)
      );
    } else {
      setSelectedItems([...selectedItems, item]);
      // Default quantity = full stock
      setBatchQuantities((prev) => ({ ...prev, [itemKey]: item.stock }));
    }
  };

  const handleBatchSubmit = () => {
    if (!batchPartner) {
      alert("Vui lòng chọn Người nhận/Chuyền");
      return;
    }
    // Prepare data
    const itemsToExport = selectedItems
      .map((item) => {
        const itemKey = `${item.sku}-${item.po}-${item.size}`;
        return {
          ...item,
          exportQty: batchQuantities[itemKey] || 0,
        };
      })
      .filter((i) => i.exportQty > 0);

    if (itemsToExport.length === 0) {
      alert("Số lượng xuất phải lớn hơn 0");
      return;
    }

    onBatchExport(itemsToExport, selectedLoc.name, batchPartner, batchDate);
    onSelectLoc(null); // Close modal
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-4 min-h-[600px] flex flex-col">
      <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
        <MapPin className="text-purple-600" /> Sơ Đồ & Vị Trí Kho
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto max-h-[600px] p-1">
        {locationKeys.map((loc) => {
          const items = mapData[loc];
          const totalQty = items.reduce((sum, item) => sum + item.stock, 0);
          const itemCount = items.length;

          return (
            <div
              key={loc}
              onClick={() => onSelectLoc({ name: loc, items })}
              className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all hover:shadow-lg active:scale-95 flex flex-col justify-between h-32 ${
                itemCount > 0
                  ? "bg-purple-50 border-purple-200 hover:border-purple-400"
                  : "bg-gray-50 border-gray-100 hover:border-gray-300 opacity-70"
              }`}
            >
              <div className="flex justify-between items-start">
                <span
                  className={`font-bold text-lg truncate ${
                    itemCount > 0 ? "text-purple-800" : "text-gray-400"
                  }`}
                >
                  {loc}
                </span>
                {itemCount > 0 && <Box className="text-purple-300 w-8 h-8" />}
              </div>

              <div className="mt-2">
                {itemCount > 0 ? (
                  <div>
                    <div className="text-2xl font-bold text-purple-700">
                      {totalQty}{" "}
                      <span className="text-xs font-normal text-gray-500">
                        sp
                      </span>
                    </div>
                    <div className="text-xs text-purple-600 font-medium">
                      {itemCount} loại hàng
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 italic mt-4 flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-300 rounded-full"></div>{" "}
                    Trống
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal chi tiết vị trí */}
      {selectedLoc && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            <div className="p-4 bg-purple-600 text-white flex justify-between items-center shadow-md z-10">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg">
                  <MapPin size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {selectedLoc.name || "Vị trí chưa xác định"}
                  </h3>
                  <p className="text-purple-100 text-xs">
                    Tổng: {selectedLoc.items.reduce((s, i) => s + i.stock, 0)}{" "}
                    sản phẩm
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedItems.length > 0 && !isBatchMode && (
                  <button
                    onClick={() => setIsBatchMode(true)}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded font-bold flex items-center gap-2 text-sm animate-bounce"
                  >
                    <LogOut size={16} /> Xuất ({selectedItems.length}) mục
                  </button>
                )}
                <button
                  onClick={() => onSelectLoc(null)}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              {isBatchMode ? (
                <div className="bg-white p-4 rounded-lg shadow-sm">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-orange-600 border-b pb-2">
                    <LogOut size={20} /> Xác nhận Xuất Kho (Nhiều mục)
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Ngày xuất
                      </label>
                      <input
                        type="date"
                        value={batchDate}
                        onChange={(e) => setBatchDate(e.target.value)}
                        className="w-full border p-2 rounded"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Người nhận / Chuyền
                      </label>
                      <select
                        value={batchPartner}
                        onChange={(e) => setBatchPartner(e.target.value)}
                        className="w-full border p-2 rounded"
                      >
                        <option value="">-- Chọn --</option>
                        {partners.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <table className="w-full text-sm text-left border rounded">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-2">Hàng hóa</th>
                        <th className="p-2 text-right">Tồn</th>
                        <th className="p-2 w-32">SL Xuất</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedItems.map((item, idx) => {
                        const itemKey = `${item.sku}-${item.po}-${item.size}`;
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">
                              <div className="font-bold">{item.style}</div>
                              <div className="text-xs text-gray-500">
                                {item.sku} | {item.color} | {item.size}
                              </div>
                            </td>
                            <td className="p-2 text-right font-medium">
                              {item.stock}
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                min="1"
                                max={item.stock}
                                className="w-full border p-1 rounded text-center font-bold"
                                value={batchQuantities[itemKey]}
                                onChange={(e) =>
                                  setBatchQuantities({
                                    ...batchQuantities,
                                    [itemKey]: parseInt(e.target.value) || 0,
                                  })
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div className="flex justify-end gap-3 mt-4 pt-4 border-t">
                    <button
                      onClick={() => setIsBatchMode(false)}
                      className="px-4 py-2 text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
                    >
                      Quay lại
                    </button>
                    <button
                      onClick={handleBatchSubmit}
                      className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 font-bold flex items-center gap-2"
                    >
                      <LogOut size={18} /> Xác nhận Xuất
                    </button>
                  </div>
                </div>
              ) : selectedLoc.items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <Box size={64} className="mb-4 opacity-20" />
                  <p>Vị trí này đang trống.</p>
                </div>
              ) : (
                <table className="w-full text-sm text-left bg-white rounded-lg shadow-sm overflow-hidden">
                  <thead className="bg-purple-50 text-purple-900 font-bold sticky top-0 shadow-sm">
                    <tr>
                      <th className="p-3 w-10 text-center">
                        {/* Header Checkbox optional */}
                      </th>
                      <th className="p-3">Mã hàng</th>
                      <th className="p-3">Style</th>
                      <th className="p-3 hidden sm:table-cell">Màu</th>
                      <th className="p-3">PO</th>
                      <th className="p-3 hidden sm:table-cell">Size</th>
                      <th className="p-3 text-right">Tồn Kho</th>
                      <th className="p-3 w-20 text-center">Tác vụ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedLoc.items.map((item, idx) => {
                      const itemKey = `${item.sku}-${item.po}-${item.size}`;
                      const isSelected = !!selectedItems.find(
                        (i) => `${i.sku}-${i.po}-${i.size}` === itemKey
                      );

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isSelected
                              ? "bg-orange-50"
                              : "hover:bg-purple-50/50"
                          }`}
                        >
                          <td className="p-3 text-center">
                            <button
                              onClick={() => toggleSelection(item)}
                              className={`p-1 rounded ${
                                isSelected
                                  ? "text-orange-600"
                                  : "text-gray-300 hover:text-gray-500"
                              }`}
                            >
                              {isSelected ? (
                                <CheckSquare size={20} />
                              ) : (
                                <Square size={20} />
                              )}
                            </button>
                          </td>
                          <td className="p-3 font-mono font-bold text-gray-600">
                            {item.sku}
                          </td>
                          <td className="p-3 font-medium">{item.style}</td>
                          <td className="p-3 hidden sm:table-cell">
                            {item.color}
                          </td>
                          <td className="p-3">
                            <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-300">
                              {item.po}
                            </span>
                          </td>
                          <td className="p-3 hidden sm:table-cell">
                            {item.size}
                          </td>
                          <td className="p-3 text-right font-bold text-lg text-purple-700">
                            {item.stock}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() =>
                                onNavigateExport(item, selectedLoc.name)
                              }
                              className="bg-orange-100 text-orange-700 p-1.5 rounded hover:bg-orange-200 transition-colors flex items-center gap-1 text-xs font-bold"
                              title="Xuất nhanh mục này"
                            >
                              <LogOut size={14} /> Xuất
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {!isBatchMode && (
              <div className="p-3 border-t bg-white text-right">
                <button
                  onClick={() => onSelectLoc(null)}
                  className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium transition-colors"
                >
                  Đóng
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// --- VIEW TỒN KHO & ĐỔI VỊ TRÍ ---
const InventoryView = ({
  products,
  history,
  onDeleteProduct,
  onUpdateLocation,
  isAdmin,
  onAdminLogin,
  onAdminLogout,
}) => {
  const [filters, setFilters] = useState({
    sku: "",
    color: "",
    unit: "",
    po: "",
  });
  const [editingKey, setEditingKey] = useState(null);
  const [newLocation, setNewLocation] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const inventoryRows = useMemo(() => {
    const rows = [];
    products.forEach((p) => {
      const stockByLoc = calculateStockByLocation(p, history);
      if (Object.keys(stockByLoc).length === 0) {
        rows.push({ ...p, stock: 0, location: "Chưa có" });
      } else {
        Object.keys(stockByLoc).forEach((loc) => {
          rows.push({
            ...p,
            stock: stockByLoc[loc],
            location: loc,
            uniqueKey: `${p.sku}-${p.po}-${p.size}-${loc}`,
          });
        });
      }
    });
    return rows;
  }, [products, history]);

  const filtered = useMemo(() => {
    return inventoryRows.filter((p) => {
      if (p.stock === 0) return false;
      const fSku = normalize(filters.sku);
      const fColor = normalize(filters.color);
      const fUnit = normalize(filters.unit);
      const fPo = normalize(filters.po);
      const matchSku =
        !fSku ||
        normalize(p.sku).includes(fSku) ||
        normalize(p.style).includes(fSku);
      const matchColor = !fColor || normalize(p.color).includes(fColor);
      const matchUnit = !fUnit || normalize(p.unit).includes(fUnit);
      const matchPo = !fPo || normalize(p.po).includes(fPo);
      return matchSku && matchColor && matchUnit && matchPo;
    });
  }, [inventoryRows, filters]);

  const handleLockClick = () => {
    if (isAdmin) {
      if (confirm("Bạn có chắc chắn muốn thoát chế độ Admin?")) {
        onAdminLogout();
      }
    } else {
      setShowAuthModal(true);
    }
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    const success = onAdminLogin(passwordInput);
    if (success) {
      setShowAuthModal(false);
      setPasswordInput("");
    }
  };

  const startEditing = (item) => {
    if (!isAdmin) return;
    setEditingKey(item.uniqueKey);
    setNewLocation(item.location === "Chưa có" ? "" : item.location);
  };

  const saveLocation = (item) => {
    onUpdateLocation(item, item.location, newLocation);
    setEditingKey(null);
  };

  const clearFilters = () =>
    setFilters({ sku: "", color: "", unit: "", po: "" });

  return (
    <div className="bg-white rounded-xl shadow-md flex flex-col h-[600px] relative">
      {/* Auth Modal */}
      {showAuthModal && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center rounded-xl p-4">
          <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Lock size={20} className="text-indigo-600" /> Nhập Mật Mã Admin
            </h3>
            <form onSubmit={handleLoginSubmit}>
              <input
                type="password"
                autoFocus
                className="w-full p-3 border rounded mb-4 text-base"
                placeholder="Mật mã..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAuthModal(false)}
                  className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-bold"
                >
                  Mở Khóa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="p-4 border-b bg-emerald-50 rounded-t-xl">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center gap-3">
            <label className="block text-sm font-bold text-emerald-800 flex items-center gap-2">
              <Filter size={18} /> Tồn Kho Chi Tiết ({filtered.length})
            </label>
            {(filters.sku || filters.color || filters.unit || filters.po) && (
              <button
                onClick={clearFilters}
                className="text-xs flex items-center gap-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded"
              >
                <X size={14} /> Xóa lọc
              </button>
            )}
          </div>

          {/* Nút Khóa / Mở Khóa */}
          <button
            onClick={handleLockClick}
            className={`p-2 rounded-full shadow-sm transition-all ${
              isAdmin
                ? "bg-red-100 text-red-600 hover:bg-red-200"
                : "bg-gray-200 text-gray-600 hover:bg-gray-300"
            }`}
            title={
              isAdmin
                ? "Đang mở khóa (Bấm để khóa)"
                : "Bấm để mở khóa chỉnh sửa"
            }
          >
            {isAdmin ? <Unlock size={20} /> : <Lock size={20} />}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <input
              type="text"
              className="w-full p-2 border border-emerald-300 rounded text-base focus:ring-1 focus:ring-emerald-600 outline-none"
              placeholder="Mã hàng / Style..."
              value={filters.sku}
              onChange={(e) => setFilters({ ...filters, sku: e.target.value })}
            />
          </div>
          <div className="relative">
            <input
              type="text"
              className="w-full p-2 border border-emerald-300 rounded text-base focus:ring-1 focus:ring-emerald-600 outline-none"
              placeholder="Màu..."
              value={filters.color}
              onChange={(e) =>
                setFilters({ ...filters, color: e.target.value })
              }
            />
          </div>
          <div className="relative">
            <input
              type="text"
              className="w-full p-2 border border-emerald-300 rounded text-base focus:ring-1 focus:ring-emerald-600 outline-none"
              placeholder="Đơn..."
              value={filters.unit}
              onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
            />
          </div>
          <div className="relative">
            <input
              type="text"
              className="w-full p-2 border border-emerald-300 rounded text-base focus:ring-1 focus:ring-emerald-600 outline-none"
              placeholder="PO..."
              value={filters.po}
              onChange={(e) => setFilters({ ...filters, po: e.target.value })}
            />
          </div>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <Package size={48} className="mb-2 opacity-20" />
            <p className="text-sm">
              Không có dữ liệu tồn kho (Tồn = 0) hoặc không khớp bộ lọc.
            </p>
          </div>
        ) : (
          <table className="w-full text-xs sm:text-sm text-left whitespace-nowrap">
            <thead className="bg-gray-100 text-gray-600 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="p-3">Mã hàng</th>
                <th className="p-3">Style</th>
                <th className="p-3 hidden sm:table-cell">Màu</th>
                <th className="p-3 hidden sm:table-cell">Size</th>
                <th className="p-3 hidden sm:table-cell">Đơn</th>
                <th className="p-3">PO</th>
                <th className="p-3 text-right font-bold text-gray-800 bg-gray-50">
                  Tồn
                </th>
                <th className="p-3 w-40">Vị Trí</th>
                <th className="p-3 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.slice(0, 100).map((item, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-emerald-50/50 transition-colors"
                >
                  <td className="p-3 font-mono font-medium text-gray-500">
                    {item.sku}
                  </td>
                  <td className="p-3 font-medium text-gray-800">
                    {item.style}
                  </td>
                  <td className="p-3 hidden sm:table-cell">{item.color}</td>
                  <td className="p-3 hidden sm:table-cell">{item.size}</td>
                  <td className="p-3 hidden sm:table-cell">{item.unit}</td>
                  <td className="p-3">{item.po}</td>
                  <td
                    className={`p-3 text-right font-bold text-lg bg-gray-50 ${
                      item.stock < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {item.stock}
                  </td>

                  <td className="p-3">
                    {editingKey === item.uniqueKey ? (
                      <div className="flex gap-1 items-center">
                        <input
                          autoFocus
                          className="w-24 p-1 border rounded text-xs text-gray-900"
                          value={newLocation}
                          onChange={(e) => setNewLocation(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveLocation(item)
                          }
                        />
                        <button
                          onClick={() => saveLocation(item)}
                          className="text-green-600 bg-green-100 p-1.5 rounded shadow hover:bg-green-200"
                        >
                          <CheckCircle size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center group">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            item.location !== "Chưa có"
                              ? "bg-indigo-100 text-indigo-700"
                              : "bg-gray-200 text-gray-500"
                          } truncate max-w-[100px]`}
                          title={item.location}
                        >
                          {item.location}
                        </span>
                        {isAdmin && (
                          <button
                            onClick={() => startEditing(item)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-600 p-2 rounded-lg shadow-md border border-blue-200 transition-all active:scale-95 flex items-center justify-center w-8 h-8 ml-2"
                            title="Sửa vị trí"
                          >
                            <Edit3 size={18} />
                          </button>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="p-3 text-right">
                    {/* BUTTON DELETE - NỔI KHỐI TO HƠN */}
                    {isAdmin && (
                      <button
                        onClick={() => onDeleteProduct(item)}
                        className="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg shadow-md border border-red-200 transition-all active:scale-95 flex items-center justify-center w-8 h-8"
                        title="Xóa dòng này"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const CatalogView = ({
  products,
  onAddProduct,
  onDeleteProduct,
  onBulkAdd,
  isAdmin,
}) => {
  const [form, setForm] = useState({
    sku: "",
    style: "",
    color: "",
    unit: "",
    po: "",
    shipdate: "",
    poQty: "",
    size: "",
    masterBoxQty: "",
    cartonSize: "",
    cartonNC: "",
    location: "",
  });
  const [term, setTerm] = useState("");
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddProduct(form);
    setForm({
      sku: "",
      style: "",
      color: "",
      unit: "",
      po: "",
      shipdate: "",
      poQty: "",
      size: "",
      masterBoxQty: "",
      cartonSize: "",
      cartonNC: "",
      location: "",
    });
  };

  const handleBulkSubmit = () => {
    if (!bulkText.trim()) return;
    const rows = bulkText.trim().split("\n");
    const newItems = [];
    rows.forEach((row) => {
      const cols = row.split("\t");
      if (cols.length >= 2) {
        newItems.push({
          sku: cols[0]?.trim().toUpperCase(),
          style: cols[1]?.trim(),
          color: cols[2]?.trim(),
          unit: cols[3]?.trim() || "",
          po: cols[4]?.trim(),
          shipdate: cols[5]?.trim(),
          poQty: cols[6]?.trim(),
          size: cols[7]?.trim(),
          masterBoxQty: cols[8]?.trim(),
          cartonSize: cols[9]?.trim(),
          cartonNC: cols[10]?.trim(),
          location: "",
        });
      }
    });
    if (newItems.length > 0) {
      onBulkAdd(newItems);
      setBulkText("");
      setIsBulkMode(false);
    } else {
      alert("Lỗi định dạng!");
    }
  };

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          normalize(p.sku).includes(normalize(term)) ||
          normalize(p.style).includes(normalize(term))
      ),
    [products, term]
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white rounded-xl shadow p-6 h-fit md:col-span-1">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-700 flex items-center gap-2">
            <Plus className="w-5 h-5 bg-indigo-100 text-indigo-600 rounded p-0.5" />{" "}
            {isBulkMode ? "Nhập Excel" : "Thêm Hàng"}
          </h3>
          <button
            onClick={() => setIsBulkMode(!isBulkMode)}
            className="text-xs bg-gray-100 hover:bg-gray-200 text-indigo-600 px-2 py-1 rounded transition-colors"
          >
            {isBulkMode ? "Thủ công" : "Excel"}
          </button>
        </div>

        {isBulkMode ? (
          <div className="space-y-4">
            <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded border border-blue-100">
              <p className="font-bold mb-1">Thứ tự 11 cột (trái qua phải):</p>
              Mã hàng | Style | Màu | Đơn | PO | Shipdate | PO qty | Size |
              Master Box | KT Thùng | NC Thùng
            </div>
            <textarea
              rows={10}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              className="w-full p-2 text-base border rounded focus:ring-2 focus:ring-indigo-500 text-gray-900 font-mono whitespace-nowrap overflow-auto"
              placeholder={`SKU01\tStyleA\tRed\tDH01\tPO123... (Không giới hạn số lượng dòng)`}
            ></textarea>
            <button
              onClick={handleBulkSubmit}
              className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 font-medium flex items-center justify-center gap-2"
            >
              <ClipboardPaste size={18} /> Xử lý dữ liệu (Batch)
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Mã hàng
                </label>
                <input
                  required
                  className="w-full p-2 text-base border rounded uppercase font-mono"
                  value={form.sku}
                  onChange={(e) =>
                    setForm({ ...form, sku: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Style
                </label>
                <input
                  required
                  className="w-full p-2 text-base border rounded"
                  value={form.style}
                  onChange={(e) => setForm({ ...form, style: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">Màu</label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.color}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Đơn</label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">PO</label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.po}
                  onChange={(e) => setForm({ ...form, po: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Shipdate
                </label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.shipdate}
                  onChange={(e) =>
                    setForm({ ...form, shipdate: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">
                  PO Qty
                </label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.poQty}
                  onChange={(e) => setForm({ ...form, poQty: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Size
                </label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  Mast. Box
                </label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.masterBoxQty}
                  onChange={(e) =>
                    setForm({ ...form, masterBoxQty: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-600">
                  KT Thùng
                </label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.cartonSize}
                  onChange={(e) =>
                    setForm({ ...form, cartonSize: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">
                  NC Thùng
                </label>
                <input
                  className="w-full p-2 text-base border rounded"
                  value={form.cartonNC}
                  onChange={(e) =>
                    setForm({ ...form, cartonNC: e.target.value })
                  }
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 font-medium text-sm mt-2"
            >
              Lưu Sản Phẩm
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const TransactionView = ({
  activeTab,
  products,
  history,
  isOnline,
  onSubmit,
  loading,
  locations,
  partners,
  onLocationsChange,
  onPartnersChange,
  prefillData, // NEW PROP
  onClearPrefill, // NEW PROP: Callback to clear data
}) => {
  const [filters, setFilters] = useState({
    sku: "",
    color: "",
    unit: "",
    po: "",
  });
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    quantity: "",
    date: new Date().toISOString().split("T")[0],
    locationOrReceiver: "",
    partner: "",
    note: "",
  });

  const quantityInputRef = useRef(null);

  useEffect(() => {
    if (selected && quantityInputRef.current) {
      setTimeout(() => {
        quantityInputRef.current.focus();
      }, 50);
    }
  }, [selected]);

  // NEW: Effect to handle prefill from Map view (Fixed)
  useEffect(() => {
    // Check if we have prefill data and we are in output mode
    if (prefillData && activeTab === "output") {
      setSelected(prefillData.item);
      // Set form with Location Source and Default Qty 1 (user requested speed)
      setForm((prev) => ({
        ...prev,
        locationOrReceiver: prefillData.location,
        quantity: 1,
      }));
      // Important: Call the parent to clear this data so it doesn't stick
      onClearPrefill();
    }
  }, [prefillData, activeTab, onClearPrefill]);

  useEffect(() => {
    // Only reset if we are NOT using prefill data this render cycle
    // This prevents the form from being wiped out immediately after prefill
    if (!prefillData && !selected) {
      setFilters({ sku: "", color: "", unit: "", po: "" });
      setForm((prev) => ({
        ...prev,
        quantity: "",
        locationOrReceiver: "",
        partner: "",
        note: "",
      }));
    }
  }, [activeTab]); // Removed other deps to avoid unnecessary clears

  const filtered = useMemo(() => {
    const hasFilter = Object.values(filters).some(
      (val) => val && val.trim() !== ""
    );
    if (!hasFilter) return [];

    return products.filter((p) => {
      const fSku = normalize(filters.sku);
      const fColor = normalize(filters.color);
      const fUnit = normalize(filters.unit);
      const fPo = normalize(filters.po);

      const matchSku =
        !fSku ||
        normalize(p.sku).includes(fSku) ||
        normalize(p.style).includes(fSku);
      const matchColor = !fColor || normalize(p.color).includes(fColor);
      const matchUnit = !fUnit || normalize(p.unit).includes(fUnit);
      const matchPo = !fPo || normalize(p.po).includes(fPo);

      return matchSku && matchColor && matchUnit && matchPo;
    });
  }, [products, filters]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selected) return;

    // --- NEW VALIDATION ---
    if (!locations.includes(form.locationOrReceiver)) {
      alert(
        "Lỗi: Vị trí không hợp lệ! Chỉ được nhập các vị trí có trong danh sách."
      );
      return;
    }
    // ----------------------

    if (activeTab === "output") {
      const reqQty = parseInt(form.quantity) || 0;
      const targetLoc = form.locationOrReceiver;

      if (!targetLoc) {
        alert("Vui lòng nhập 'Xuất từ Vị trí' để kiểm tra tồn kho!");
        return;
      }

      const stockMap = calculateStockByLocation(selected, history);
      const currentStockAtLoc = stockMap[targetLoc] || 0;

      if (currentStockAtLoc <= 0) {
        alert(
          `LỖI: Vị trí '${targetLoc}' hiện không có hàng (Tồn: ${currentStockAtLoc}). Không thể xuất.`
        );
        return;
      }
      if (reqQty > currentStockAtLoc) {
        alert(
          `LỖI: Số lượng xuất (${reqQty}) vượt quá tồn tại '${targetLoc}' (${currentStockAtLoc}).`
        );
        return;
      }
    }

    onSubmit(selected, form);
    setForm((prev) => ({ ...prev, quantity: "", note: "" }));
    setSelected(null);
  };

  const clearFilters = () =>
    setFilters({ sku: "", color: "", unit: "", po: "" });

  const stockStats = useMemo(
    () => (selected ? calculateStockByLocation(selected, history) : {}),
    [selected, history]
  );
  const stockDisplay = selected
    ? Object.entries(stockStats)
        .map(([loc, qty]) => `${loc}: ${qty}`)
        .join(" | ")
    : "";

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-2 bg-white rounded-xl shadow flex flex-col h-[600px]">
        <div className="p-4 border-b bg-gray-50">
          <div className="flex justify-between items-center mb-3">
            <label className="block text-sm font-bold text-gray-700 flex items-center gap-2">
              <Filter size={18} className="text-indigo-600" />
              Bước 1: Lọc & Chọn hàng ({filtered.length})
            </label>
            {(filters.sku || filters.color || filters.unit || filters.po) && (
              <button
                onClick={clearFilters}
                className="text-xs flex items-center gap-1 text-red-600 hover:bg-red-50 px-2 py-1 rounded"
              >
                <X size={14} /> Xóa lọc
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded text-base focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Mã hàng..."
                value={filters.sku}
                onChange={(e) =>
                  setFilters({ ...filters, sku: e.target.value })
                }
              />
            </div>
            <div className="relative">
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded text-base focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Màu..."
                value={filters.color}
                onChange={(e) =>
                  setFilters({ ...filters, color: e.target.value })
                }
              />
            </div>
            <div className="relative">
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded text-base focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="Đơn..."
                value={filters.unit}
                onChange={(e) =>
                  setFilters({ ...filters, unit: e.target.value })
                }
              />
            </div>
            <div className="relative">
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded text-base focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="PO..."
                value={filters.po}
                onChange={(e) => setFilters({ ...filters, po: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
              {filters.sku || filters.color || filters.unit || filters.po ? (
                <p>Không tìm thấy kết quả phù hợp.</p>
              ) : (
                <>
                  <Search size={48} className="mb-2 opacity-20" />
                  <p className="text-sm">
                    Vui lòng nhập thông tin vào bộ lọc ở trên để tìm kiếm.
                  </p>
                </>
              )}
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.slice(0, 50).map((p, idx) => (
                <li
                  key={idx}
                  onClick={() => setSelected(p)}
                  className={`p-3 cursor-pointer hover:bg-blue-50 transition-colors flex justify-between items-center ${
                    selected?.sku === p.sku &&
                    selected?.po === p.po &&
                    selected?.size === p.size
                      ? "bg-blue-100 ring-2 ring-inset ring-blue-400"
                      : ""
                  }`}
                >
                  <div>
                    <div className="font-bold text-gray-800 text-lg flex gap-2 items-center">
                      <span>{p.style}</span>
                      <span className="text-sm bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                        PO: {p.po}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      <span className="font-mono font-bold text-gray-700">
                        {p.sku}
                      </span>
                      <span className="mx-1">|</span> Màu: {p.color}
                      <span className="mx-1">|</span> Đơn: {p.unit}
                      <span className="mx-1">|</span> Size: {p.size}
                    </div>
                  </div>
                  <div className="text-gray-400">
                    {selected?.sku === p.sku && selected?.po === p.po ? (
                      <CheckCircle size={24} className="text-blue-600" />
                    ) : (
                      <Plus size={20} />
                    )}
                  </div>
                </li>
              ))}
              {filtered.length > 50 && (
                <li className="p-4 text-center text-sm text-gray-500">
                  Đang hiển thị 50 / {filtered.length} kết quả. Hãy nhập thêm
                  chi tiết.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      <div
        className={`rounded-xl shadow p-6 h-fit text-white transition-colors duration-300 ${
          activeTab === "input" ? "bg-blue-600" : "bg-orange-500"
        }`}
      >
        <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
          {activeTab === "input" ? <ArrowDownLeft /> : <ArrowUpRight />}{" "}
          {activeTab === "input" ? "Phiếu Nhập" : "Phiếu Xuất"}
        </h3>
        {!selected ? (
          <div className="text-white/70 text-center py-10 border-2 border-dashed border-white/30 rounded-lg">
            Vui lòng chọn hàng từ danh sách.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-white/10 p-3 rounded-lg">
              <div className="text-xs opacity-75">Đang chọn:</div>
              <div className="font-bold text-lg truncate">{selected.sku}</div>
              <div className="text-sm font-medium">
                {selected.style} - {selected.color}
              </div>
              <div className="text-xs opacity-75 mt-1">
                Đơn: {selected.unit} | PO: {selected.po}
              </div>
              <div className="mt-2 pt-2 border-t border-white/20 text-xs font-mono text-yellow-200">
                Tồn: {stockDisplay || "0"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Ngày</label>
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full p-2 rounded text-gray-800 text-base outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Số lượng
                </label>
                <input
                  ref={quantityInputRef}
                  autoFocus
                  required
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value })
                  }
                  className="w-full p-2 rounded text-gray-800 font-bold text-center outline-none focus:ring-4 focus:ring-white/50 text-base"
                  placeholder="0"
                />
              </div>
            </div>

            <ConfigurableSelect
              label={
                activeTab === "input"
                  ? "Vị trí / Kệ (Nhập vào)"
                  : "Xuất từ Vị trí (Kệ/Line)"
              }
              value={form.locationOrReceiver}
              onChange={(val) => setForm({ ...form, locationOrReceiver: val })}
              options={locations}
              onOptionsChange={onLocationsChange}
              placeholder={
                activeTab === "input" ? "Chọn vị trí..." : "Chọn vị trí xuất..."
              }
              required={true}
              allowAdd={false} // QUAN TRỌNG: Chỉ cho chọn, không cho thêm mới tại đây
            />

            <ConfigurableSelect
              label={
                activeTab === "input"
                  ? "Nhà Cung Cấp / Nguồn"
                  : "Người Nhận / Chuyền"
              }
              value={form.partner}
              onChange={(val) => setForm({ ...form, partner: val })}
              options={partners}
              onOptionsChange={onPartnersChange}
              placeholder="Chọn đối tác..."
              allowAdd={true} // Partner vẫn cho phép thêm mới
            />

            <div>
              <label className="block text-sm font-medium mb-1">
                Ghi chú thêm
              </label>
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full p-2 rounded text-gray-800 text-base outline-none"
                placeholder="..."
              />
            </div>
            <button
              type="submit"
              disabled={loading || !isOnline}
              className={`w-full font-bold py-3 rounded-lg shadow-lg transition-transform active:scale-95 flex justify-center items-center gap-2 mt-4 ${
                isOnline
                  ? "bg-white text-gray-900 hover:bg-gray-100"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              }`}
            >
              {loading ? (
                "Đang xử lý..."
              ) : (
                <>
                  <Save size={20} /> {isOnline ? `LƯU PHIẾU` : "Đang mất mạng"}
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

const HistoryView = ({ history, onDeleteHistoryItem, isAdmin }) => (
  <div className="bg-white rounded-xl shadow-md p-6">
    <h2 className="text-xl font-bold text-gray-700 mb-4 border-b pb-2">
      Nhật Ký Nhập Xuất (Gần đây)
    </h2>
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-100 text-gray-600">
          <tr>
            <th className="p-3">Ngày</th>
            <th className="p-3">Loại</th>
            <th className="p-3">Mã hàng</th>
            <th className="p-3">Style</th>
            <th className="p-3 text-right">SL</th>
            <th className="p-3">Vị trí/Nơi nhận</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {history.slice(0, 100).map((h, i) => (
            <tr key={i} className="hover:bg-gray-50 group">
              <td className="p-3 text-gray-600">{formatDateDisplay(h.date)}</td>
              <td className="p-3">
                <span
                  className={`text-xs font-bold px-2 py-1 rounded ${
                    h.type === "NHẬP"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {h.type}
                </span>
              </td>
              <td className="p-3 font-mono">{h.sku}</td>
              <td className="p-3">{h.style}</td>
              <td className="p-3 text-right font-bold">{h.quantity}</td>
              <td className="p-3 text-gray-600 truncate max-w-[150px]">
                {h.locationOrReceiver}
              </td>
              <td className="p-3 text-right">
                {/* BUTTON DELETE - NỔI KHỐI TO HƠN */}
                {isAdmin && (
                  <button
                    onClick={() => onDeleteHistoryItem(i)}
                    className="bg-red-100 hover:bg-red-200 text-red-600 p-2 rounded-lg shadow-md border border-red-200 transition-all active:scale-95 flex items-center justify-center w-8 h-8"
                    title="Xóa phiếu này (trên App)"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const SettingsHelpView = ({
  activeTab,
  scriptUrl,
  onSaveUrl,
  showNotification,
  onChangePassword,
  currentPassword,
  locations,
  onLocationsChange,
}) => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newLocationInput, setNewLocationInput] = useState("");

  const handleChangePassword = () => {
    if (oldPassword !== currentPassword) {
      showNotification("error", "Mật mã cũ không đúng! Vui lòng nhập lại.");
      return;
    }
    if (newPassword.length < 4) {
      showNotification("error", "Mật mã phải có ít nhất 4 ký tự!");
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotification("error", "Mật mã xác nhận không khớp!");
      return;
    }
    onChangePassword(newPassword);
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleAddLocation = () => {
    if (!newLocationInput.trim()) return;
    if (locations.includes(newLocationInput.trim())) {
      showNotification("error", "Vị trí này đã tồn tại!");
      return;
    }
    onLocationsChange([...locations, newLocationInput.trim()]);
    setNewLocationInput("");
    showNotification("success", "Đã thêm vị trí mới!");
  };

  const handleRemoveLocation = (locToRemove) => {
    if (confirm(`Xóa vị trí "${locToRemove}"?`)) {
      onLocationsChange(locations.filter((l) => l !== locToRemove));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 max-w-2xl mx-auto">
      {activeTab === "settings" ? (
        <>
          <h2 className="text-xl font-bold mb-4">Cấu Hình Kết Nối</h2>
          <input
            type="text"
            value={scriptUrl}
            onChange={(e) => onSaveUrl(e.target.value)}
            placeholder="Dán Web App URL vào đây..."
            className="w-full p-3 border rounded mb-4 text-base"
          />
          <button
            onClick={() =>
              showNotification(
                "success",
                "Đã lưu (Cần bấm Đồng bộ để tải dữ liệu về)"
              )
            }
            className="bg-green-600 text-white px-6 py-2 rounded"
          >
            Lưu cấu hình
          </button>

          <hr className="my-6 border-gray-200" />

          {/* --- QUẢN LÝ VỊ TRÍ KHO --- */}
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <MapPin className="text-purple-600" /> Quản lý Danh Sách Vị Trí
          </h2>
          <div className="bg-purple-50 p-4 rounded-lg mb-6">
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                className="flex-1 p-2 border border-purple-200 rounded text-base outline-none focus:border-purple-500"
                placeholder="Nhập tên kệ/vị trí mới (VD: Kệ C1)..."
                value={newLocationInput}
                onChange={(e) => setNewLocationInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddLocation()}
              />
              <button
                onClick={handleAddLocation}
                className="bg-purple-600 text-white px-4 py-2 rounded font-bold hover:bg-purple-700"
              >
                Thêm
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {locations.length === 0 && (
                <span className="text-gray-400 text-sm italic">
                  Chưa có vị trí nào.
                </span>
              )}
              {locations.map((loc, idx) => (
                <span
                  key={idx}
                  className="bg-white text-purple-800 px-3 py-1 rounded-full shadow-sm border border-purple-100 flex items-center gap-2 font-medium"
                >
                  {loc}
                  <button
                    onClick={() => handleRemoveLocation(loc)}
                    className="text-gray-400 hover:text-red-500 p-0.5 rounded-full"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 italic">
              * Danh sách này sẽ được đồng bộ lên Google Sheet để dùng chung cho
              mọi thiết bị.
            </p>
          </div>

          <hr className="my-6 border-gray-200" />

          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <KeyRound className="text-indigo-600" /> Cài đặt mật mã Admin
          </h2>
          <div className="space-y-3">
            {/* BỔ SUNG: Ô nhập mật mã cũ */}
            <input
              type="password"
              className="w-full p-2 border rounded text-base"
              placeholder="Mật mã hiện tại..."
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <input
              type="password"
              className="w-full p-2 border rounded text-base"
              placeholder="Mật mã mới..."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <input
              type="password"
              className="w-full p-2 border rounded text-base"
              placeholder="Xác nhận mật mã mới..."
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              onClick={handleChangePassword}
              className="bg-indigo-600 text-white px-4 py-2 rounded w-full font-bold"
            >
              Lưu & Đồng bộ mật mã
            </button>
            <p className="text-xs text-gray-500 italic">
              * Mật mã sẽ được lưu lên đám mây và áp dụng cho tất cả các máy.
            </p>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold mb-4 text-blue-600">
            CẬP NHẬT MÃ SCRIPT MỚI (V2.7 - Tự Động Đồng Bộ Vị Trí)
          </h2>
          <p className="mb-2 text-sm text-red-500 font-bold">
            QUAN TRỌNG: Bạn CẦN cập nhật mã này để hỗ trợ tính năng đồng bộ danh
            sách vị trí kho.
          </p>
          <div className="bg-gray-900 text-gray-100 p-4 rounded text-xs overflow-x-auto relative">
            <button
              onClick={() => {
                navigator.clipboard.writeText(SCRIPT_CODE);
                showNotification("success", "Đã copy code");
              }}
              className="absolute top-2 right-2 text-white bg-gray-700 p-1 rounded hover:bg-gray-600"
            >
              <Copy size={14} />
            </button>
            <pre>{SCRIPT_CODE}</pre>
          </div>
          <div className="mt-4 text-sm">
            <strong>Hướng dẫn Deploy lại (Bắt buộc):</strong>
            <ul className="list-disc ml-5 mt-1 text-gray-600">
              <li>Vào Extensions &gt; Apps Script.</li>
              <li>Dán đè code mới vào.</li>
              <li>
                Bấm <strong>Deploy</strong> &rarr;{" "}
                <strong>New Deployment</strong>.
              </li>
              <li>
                Chọn type: Web app. Who has access: <strong>Anyone</strong>.
              </li>
              <li>Bấm Deploy và dùng URL đó.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

const QRScannerModal = ({ onClose, onScan }) => {
  const [errorMsg, setErrorMsg] = useState("");
  const scanProcessed = useRef(false);
  const [key, setKey] = useState(0);

  const handleResult = (data) => {
    if (data) {
      if (scanProcessed.current) return;

      const code = data?.text || data;
      if (code) {
        scanProcessed.current = true;
        onScan(code);
      }
    }
  };

  const handleError = (err) => {
    // console.error(err);
    if (
      err &&
      (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
    ) {
      setErrorMsg(
        "Quyền truy cập Camera bị từ chối. Vui lòng cấp quyền và thử lại."
      );
    } else {
      setErrorMsg("Lỗi Camera: " + (err.message || "Không xác định"));
    }
  };

  // Hàm để gọi xin cấp quyền thủ công nếu người dùng bấm nút
  const requestCameraPermission = async () => {
    try {
      // Gọi getUserMedia để kích hoạt prompt của trình duyệt
      await navigator.mediaDevices.getUserMedia({ video: true });
      // Nếu thành công, reset lỗi và remount lại scanner để nó tự chạy
      setErrorMsg("");
      setKey((prev) => prev + 1);
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col animate-fade-in">
      {/* Header Modal */}
      <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
        <h2 className="font-bold flex items-center gap-2">
          <Scan className="text-indigo-400" /> Quét Mã Vị Trí
        </h2>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 rounded-full hover:bg-white/20"
        >
          <X size={24} />
        </button>
      </div>

      {/* Camera Area */}
      <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
        <div className="w-full h-full max-w-md mx-auto relative bg-black rounded-lg overflow-hidden flex items-center justify-center">
          {!errorMsg ? (
            <>
              {/* Thư viện QR Scanner chuẩn (react-qr-scanner) */}
              <QrScanner
                key={key}
                delay={300}
                onError={handleError}
                onScan={handleResult}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                constraints={{
                  video: { facingMode: "environment" },
                }}
              />

              {/* Overlay khung quét */}
              <div className="absolute inset-0 border-2 border-indigo-500/50 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-indigo-400 rounded-lg relative">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-indigo-400 -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-indigo-400 -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-indigo-400 -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-indigo-400 -mb-1 -mr-1"></div>
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-indigo-400 shadow-[0_0_10px_#818cf8] animate-[scan_2s_infinite]"></div>
                </div>
              </div>
              <div className="absolute bottom-10 w-full text-center text-white/80 text-sm">
                Đưa mã QR vị trí vào khung hình
              </div>
            </>
          ) : (
            <div className="text-center p-6 text-white bg-gray-900 rounded-lg m-4 shadow-xl border border-gray-700">
              <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
              <p className="mb-6 text-lg">{errorMsg}</p>
              <button
                onClick={requestCameraPermission}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-bold flex items-center gap-2 mx-auto shadow-lg transition-transform active:scale-95"
              >
                <Camera size={20} /> Cấp quyền Camera
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [activeTab, setActiveTab] = useState("input");
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [notification, setNotification] = useState({ type: "", message: "" });
  const [scriptUrl, setScriptUrl] = useState("");
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [locations, setLocations] = useState([
    "Kệ A1",
    "Kệ A2",
    "Kệ B1",
    "Kệ B2",
    "Kho Tổng",
  ]);
  const [partners, setPartners] = useState([
    "NCC A",
    "Chuyền 1",
    "Chuyền 2",
    "Kho Lẻ",
  ]);

  // ADMIN STATE
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("123456");

  // QR STATE & LIFTED STATE FROM WAREHOUSE VISUAL VIEW
  const [showScanner, setShowScanner] = useState(false);
  const [selectedLoc, setSelectedLoc] = useState(null); // Lifted state

  // NEW STATE: Dữ liệu prefill để nhảy sang trang Xuất
  const [prefillExportData, setPrefillExportData] = useState(null);

  useEffect(() => {
    const savedUrl = localStorage.getItem("googleSheetScriptUrl");
    const savedHistory = localStorage.getItem("warehouseHistory");
    const savedProducts = localStorage.getItem("warehouseProducts");
    const savedLocations = localStorage.getItem("warehouseLocations");
    const savedPartners = localStorage.getItem("warehousePartners");
    const savedAdminPass = localStorage.getItem("warehouseAdminPassword");

    if (savedUrl) setScriptUrl(savedUrl);
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    if (savedProducts) setProducts(JSON.parse(savedProducts));
    if (savedLocations) setLocations(JSON.parse(savedLocations));
    if (savedPartners) setPartners(JSON.parse(savedPartners));
    if (savedAdminPass) setAdminPassword(savedAdminPass);

    if (!document.querySelector('script[src*="tailwindcss"]')) {
      const script = document.createElement("script");
      script.src = "https://cdn.tailwindcss.com";
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification({ type: "", message: "" }), 5000);
  };

  const isOnline = useNetworkStatus(showNotification);

  // --- LOGIC TÍNH TOÁN SƠ ĐỒ KHO (Moved from Child to Parent) ---
  const mapData = useMemo(() => {
    const data = {};
    // 1. Khởi tạo các vị trí
    locations.forEach((loc) => {
      data[loc] = [];
    });
    // 2. Quét qua từng sản phẩm để tính tồn kho tại các vị trí
    products.forEach((p) => {
      const stockByLoc = calculateStockByLocation(p, history);
      Object.entries(stockByLoc).forEach(([loc, qty]) => {
        if (qty > 0 && locations.includes(loc)) {
          data[loc].push({ ...p, stock: qty });
        }
      });
    });
    return data;
  }, [products, history, locations]);

  // --- LOGIC XỬ LÝ SCAN QR (UPDATED) ---
  const handleScan = (code) => {
    if (code) {
      // 1. QUAN TRỌNG: Đóng scanner ngay lập tức để tránh loop
      setShowScanner(false);

      if (code.toLowerCase().startsWith("khovo:")) {
        // Lấy tên vị trí sau tiền tố
        const locName = code.substring(6).trim(); // "khovo:".length === 6

        if (locations.includes(locName)) {
          // 2. Chuyển tab sang map
          setActiveTab("map");
          // 3. Set vị trí đang chọn để mở modal
          const items = mapData[locName] || [];
          setSelectedLoc({ name: locName, items });

          showNotification("success", `Đã tìm thấy vị trí: ${locName}`);
        } else {
          // Nếu có tiền tố đúng nhưng tên vị trí không tồn tại -> Báo lỗi và đã tắt scanner
          showNotification(
            "error",
            `Vị trí "${locName}" chưa được khai báo trong hệ thống!`
          );
        }
      } else {
        // Nếu mã không đúng định dạng (không có khovo:) -> Báo lỗi và đã tắt scanner
        showNotification(
          "error",
          "Mã QR không hợp lệ (Phải bắt đầu bằng 'khovo:')"
        );
      }
    }
  };

  const handleLocationsChange = async (newLocs) => {
    setLocations(newLocs);
    localStorage.setItem("warehouseLocations", JSON.stringify(newLocs));

    // --- GỬI DANH SÁCH MỚI LÊN SHEET ---
    await postToSheet({
      action: "update_locations",
      locations: newLocs,
    });
  };

  const handlePartnersChange = (newPartners) => {
    setPartners(newPartners);
    localStorage.setItem("warehousePartners", JSON.stringify(newPartners));
  };

  const handleAdminLogin = (inputPass) => {
    if (inputPass === adminPassword) {
      setIsAdmin(true);
      return true;
    }
    showNotification("error", "Mật mã không đúng!");
    return false;
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    showNotification("info", "Đã thoát chế độ Admin.");
  };

  const handleChangePassword = async (newPass) => {
    setAdminPassword(newPass);
    localStorage.setItem("warehouseAdminPassword", newPass);
    const success = await postToSheet({
      action: "update_password",
      password: newPass,
    });
    if (success) {
      showNotification("success", "Đã lưu mật mã mới lên hệ thống!");
    } else {
      showNotification(
        "warning",
        "Đã lưu trên máy này nhưng lỗi đồng bộ. Hãy kiểm tra mạng."
      );
    }
  };

  const handleSyncData = useCallback(
    async (silent = false) => {
      if (!scriptUrl) return;
      if (!silent) {
        setIsSyncing(true);
        setSyncStatus("syncing");
      } else {
        setSyncStatus("syncing");
      }

      try {
        const urlWithCache = scriptUrl.includes("?")
          ? `${scriptUrl}&t=${new Date().getTime()}`
          : `${scriptUrl}?t=${new Date().getTime()}`;

        const response = await fetch(urlWithCache);
        const data = await response.json();

        if (data.history) {
          setHistory(data.history);
          localStorage.setItem(
            "warehouseHistory",
            JSON.stringify(data.history)
          );
        }
        if (data.products) {
          setProducts(data.products);
          localStorage.setItem(
            "warehouseProducts",
            JSON.stringify(data.products)
          );
        }

        if (data.settings && data.settings.password) {
          setAdminPassword(data.settings.password);
          localStorage.setItem(
            "warehouseAdminPassword",
            data.settings.password
          );
        }

        // --- ĐỒNG BỘ DANH SÁCH VỊ TRÍ TỪ SHEET ---
        if (
          data.locations &&
          Array.isArray(data.locations) &&
          data.locations.length > 0
        ) {
          setLocations(data.locations);
          localStorage.setItem(
            "warehouseLocations",
            JSON.stringify(data.locations)
          );
        }

        if (!silent)
          showNotification("success", "Đã đồng bộ dữ liệu mới nhất từ Sheet!");
        setSyncStatus("success");
      } catch (e) {
        if (!silent)
          showNotification("error", "Lỗi đồng bộ. Kiểm tra lại mạng hoặc URL.");
        setSyncStatus("error");
      } finally {
        if (!silent) setIsSyncing(false);
      }
    },
    [scriptUrl]
  );

  useEffect(() => {
    if (!scriptUrl || !isOnline) return;
    const intervalId = setInterval(() => {
      if (!isSyncing) handleSyncData(true);
    }, 20000);
    return () => clearInterval(intervalId);
  }, [scriptUrl, isOnline, isSyncing, handleSyncData]);

  const handleSaveUrl = (url) => {
    setScriptUrl(url);
    localStorage.setItem("googleSheetScriptUrl", url);
  };

  const postToSheet = async (payload) => {
    if (!isOnline) {
      showNotification("error", "Mất mạng!");
      return false;
    }
    if (!scriptUrl) {
      showNotification("error", "Chưa có URL!");
      return false;
    }
    try {
      await fetch(scriptUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return true;
    } catch (e) {
      showNotification("error", "Lỗi kết nối Sheet!");
      return false;
    }
  };

  const handleAddProduct = async (newProduct) => {
    if (
      products.some(
        (p) =>
          p.sku === newProduct.sku &&
          p.style === newProduct.style &&
          p.po === newProduct.po &&
          p.size === newProduct.size
      )
    ) {
      showNotification("error", "Sản phẩm này đã tồn tại!");
      return;
    }
    const updated = [...products, newProduct];
    setProducts(updated);
    localStorage.setItem("warehouseProducts", JSON.stringify(updated));
    showNotification("success", "Đã thêm (Đang đồng bộ...)");
    const success = await postToSheet({ action: "add_product", ...newProduct });
    if (success) showNotification("success", "Đã lưu lên Sheet thành công!");
  };

  const handleBulkAddProducts = async (newItems) => {
    let addedCount = 0;
    const currentItems = new Set(
      products.map((p) => `${p.sku}-${p.style}-${p.po}-${p.size}`)
    );
    const itemsToAdd = [];
    newItems.forEach((item) => {
      const key = `${item.sku}-${item.style}-${item.po}-${item.size}`;
      if (!currentItems.has(key)) {
        itemsToAdd.push(item);
        currentItems.add(key);
        addedCount++;
      }
    });
    if (addedCount > 0) {
      const updated = [...products, ...itemsToAdd];
      setProducts(updated);
      localStorage.setItem("warehouseProducts", JSON.stringify(updated));
      showNotification(
        "info",
        `Đang đồng bộ ${addedCount} sản phẩm lên Sheet...`
      );
      const success = await postToSheet({
        action: "bulk_add_products",
        items: itemsToAdd,
      });
      if (success)
        showNotification(
          "success",
          `Đã thêm và đồng bộ ${addedCount} hàng thành công!`
        );
    } else {
      showNotification("error", "Không có hàng mới (Trùng lặp hết).");
    }
  };

  const handleDeleteProduct = async (itemToDelete) => {
    if (confirm("Xóa hàng này?")) {
      const updated = products.filter(
        (p) =>
          !(
            p.sku === itemToDelete.sku &&
            p.po === itemToDelete.po &&
            p.size === itemToDelete.size &&
            p.style === itemToDelete.style
          )
      );
      setProducts(updated);
      localStorage.setItem("warehouseProducts", JSON.stringify(updated));
      postToSheet({ action: "delete_product", ...itemToDelete });
    }
  };

  const handleUpdateLocation = async (itemToUpdate, oldLoc, newLoc) => {
    const updatedHistory = history.map((h) => {
      if (
        h.type === "NHẬP" &&
        normalize(h.sku) === normalize(itemToUpdate.sku) &&
        normalize(h.po) === normalize(itemToUpdate.po) &&
        normalize(h.size) === normalize(itemToUpdate.size) &&
        h.locationOrReceiver === oldLoc
      ) {
        return { ...h, locationOrReceiver: newLoc };
      }
      return h;
    });
    setHistory(updatedHistory);
    localStorage.setItem("warehouseHistory", JSON.stringify(updatedHistory));

    showNotification("info", "Đang cập nhật vị trí trên Sheet...");

    const success = await postToSheet({
      action: "update_location_history",
      ...itemToUpdate,
      oldLocation: oldLoc,
      newLocation: newLoc,
    });

    if (success) showNotification("success", "Đã cập nhật vị trí thành công!");
  };

  const handleTransaction = async (selectedProduct, formData) => {
    setLoading(true);
    const combinedNote = formData.partner
      ? `${formData.partner} | ${formData.note}`
      : formData.note;

    const dataToSend = {
      action: "transaction",
      date: formData.date,
      type: activeTab === "input" ? "NHẬP" : "XUẤT",
      sku: selectedProduct.sku,
      style: selectedProduct.style,
      color: selectedProduct.color,
      unit: selectedProduct.unit,
      po: selectedProduct.po,
      shipdate: selectedProduct.shipdate,
      poQty: selectedProduct.poQty,
      size: selectedProduct.size,
      masterBoxQty: selectedProduct.masterBoxQty,
      cartonSize: selectedProduct.cartonSize,
      cartonNC: selectedProduct.cartonNC,
      quantity: formData.quantity,
      locationOrReceiver: formData.locationOrReceiver,
      note: combinedNote,
    };
    const success = await postToSheet(dataToSend);
    setLoading(false);
    if (success) {
      const newHistory = [dataToSend, ...history];
      setHistory(newHistory);
      localStorage.setItem("warehouseHistory", JSON.stringify(newHistory));
      if (activeTab === "input" && formData.locationOrReceiver) {
        handleUpdateLocation(selectedProduct, formData.locationOrReceiver);
      }
      showNotification("success", "Thành công!");
    }
  };

  // --- NEW: Handle Batch Export ---
  const handleBatchTransaction = async (items, location, partner, date) => {
    setLoading(true);
    const newTransactions = [];
    let successCount = 0;

    for (const item of items) {
      const combinedNote = partner
        ? `${partner} | Xuất nhanh từ sơ đồ`
        : "Xuất nhanh từ sơ đồ";
      const dataToSend = {
        action: "transaction",
        date: date,
        type: "XUẤT",
        sku: item.sku,
        style: item.style,
        color: item.color,
        unit: item.unit,
        po: item.po,
        shipdate: item.shipdate,
        poQty: item.poQty,
        size: item.size,
        masterBoxQty: item.masterBoxQty,
        cartonSize: item.cartonSize,
        cartonNC: item.cartonNC,
        quantity: item.exportQty,
        locationOrReceiver: location, // Xuất từ vị trí này
        note: combinedNote,
      };

      // Gửi từng request để đảm bảo an toàn dữ liệu
      const success = await postToSheet(dataToSend);
      if (success) {
        newTransactions.push(dataToSend);
        successCount++;
      }
    }

    setLoading(false);
    if (newTransactions.length > 0) {
      const updatedHistory = [...newTransactions, ...history];
      setHistory(updatedHistory);
      localStorage.setItem("warehouseHistory", JSON.stringify(updatedHistory));
      showNotification(
        "success",
        `Đã xuất kho thành công ${successCount} mục!`
      );
    }
  };

  // --- NEW: Handle Navigate to Export Tab ---
  const handleNavigateExport = (item, location) => {
    setPrefillExportData({ item, location });
    setActiveTab("output");
    // Reset prefill data sau khi đã switch tab (useEffect trong TransactionView sẽ bắt)
    setTimeout(() => setPrefillExportData(null), 500);
  };

  const handleClearPrefill = useCallback(() => {
    setPrefillExportData(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans pb-10">
      <Header
        isOnline={isOnline}
        scriptUrl={scriptUrl}
        onSync={() => handleSyncData(false)}
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        isAdmin={isAdmin}
        onToggleScanner={() => setShowScanner(true)} // Toggle Scanner Modal
      />
      <NotificationToast notification={notification} />

      {/* SCANNER MODAL */}
      {showScanner && (
        <QRScannerModal
          onClose={() => setShowScanner(false)}
          onScan={handleScan}
        />
      )}

      <main className="container mx-auto p-4 max-w-6xl">
        <NavTabs activeTab={activeTab} setActiveTab={setActiveTab} />
        {activeTab === "catalog" && (
          <CatalogView
            products={products}
            onAddProduct={handleAddProduct}
            onDeleteProduct={handleDeleteProduct}
            onBulkAdd={handleBulkAddProducts}
            isAdmin={isAdmin}
          />
        )}
        {(activeTab === "input" || activeTab === "output") && (
          <TransactionView
            activeTab={activeTab}
            products={products}
            history={history}
            isOnline={isOnline}
            loading={loading}
            onSubmit={handleTransaction}
            locations={locations}
            partners={partners}
            onLocationsChange={handleLocationsChange}
            onPartnersChange={handlePartnersChange}
            prefillData={prefillExportData} // Pass prefill data
            onClearPrefill={handleClearPrefill} // Pass clearer
          />
        )}
        {activeTab === "inventory" && (
          <InventoryView
            products={products}
            history={history}
            onDeleteProduct={handleDeleteProduct}
            onUpdateLocation={handleUpdateLocation}
            isAdmin={isAdmin}
            onAdminLogin={handleAdminLogin}
            onAdminLogout={handleAdminLogout}
          />
        )}
        {activeTab === "map" && (
          <WarehouseVisualView
            // Truyền props từ App xuống thay vì tính toán bên trong
            mapData={mapData}
            selectedLoc={selectedLoc}
            onSelectLoc={setSelectedLoc}
            onNavigateExport={handleNavigateExport} // New prop for jumping to export
            partners={partners} // For batch export modal
            onBatchExport={handleBatchTransaction} // For batch export logic
          />
        )}
        {activeTab === "history" && (
          <HistoryView
            history={history}
            onDeleteHistoryItem={() => {}}
            isAdmin={isAdmin}
          />
        )}
        {(activeTab === "settings" || activeTab === "help") && (
          <SettingsHelpView
            activeTab={activeTab}
            scriptUrl={scriptUrl}
            onSaveUrl={handleSaveUrl}
            showNotification={showNotification}
            onChangePassword={handleChangePassword}
            currentPassword={adminPassword}
            locations={locations}
            onLocationsChange={handleLocationsChange}
          />
        )}
      </main>
    </div>
  );
}
