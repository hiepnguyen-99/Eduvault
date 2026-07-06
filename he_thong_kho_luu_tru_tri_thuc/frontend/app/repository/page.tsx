"use client";

import Link from "next/link";
import { Children, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, ChevronRight, File, FilePenLine, FilePlus2, Folder, FolderOpen, LayoutGrid, List, LoaderCircle, Pencil, Search, Send, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { labelForUploadSource, useUploadTasks } from "@/components/upload-task-provider";
import { DashboardData, Document, DocumentDetail, FolderNode, formatDate, MyFolderTree } from "@/lib/api";
import { useBackendData } from "@/lib/hooks";
import { PageHeader, Panel } from "@/components/ui";

type DocumentForm = {
  title: string;
  topic: string;
  doc_type: string;
  visibility: "public" | "private";
  folder_path: string;
  folder_node_id?: string;
  content: string;
};

type FolderTree = {
  [name: string]: FolderTree | { id: string; title: string }[];
};

type TreeRow =
  | { type: "folder"; id: string; name: string; path: string; parentPath: string; depth: number; hasChildren: boolean }
  | { type: "file"; id: string; name: string; path: string; depth: number };

type DestinationChatMessage = { role: "assistant" | "user"; content: string };
type UploadDestination = { source: "manual" | "ai" | ""; badge: string; specialization_id: string | null; course_id: string | null; folder_node_id: string | null; document_type: string; path: string };

const empty: DashboardData = { user:{code:"",name:"",role:"lecturer",department:"",permissions:[]},stats:{documents:0,private:0,topics:0},documents:[],requests:[],backups:[],audit:[] };
const DOCUMENT_TYPES = ["Đề cương môn học","Kế hoạch giảng dạy","Bài giảng","Slide","Giáo trình","Sách tham khảo","Tài liệu tham khảo","Lab","Bài tập","Đồ án","Đề thi","Đáp án","Ngân hàng câu hỏi","Nghiên cứu khoa học","Tài liệu khác"];
const DEFAULT_DOCUMENT_TYPE = "Tài liệu khác";
const emptyForm: DocumentForm = { title:"", topic:"", doc_type:DEFAULT_DOCUMENT_TYPE, visibility:"public", folder_path:"", folder_node_id:"", content:"" };
const emptyMyTree: MyFolderTree = { policy:null, name:"Kho cua toi", children:[] };
const visibilityLabel = (value: string) => value === "public" ? "Công khai" : "Riêng tư";
const MB = 1024 * 1024;
const MAX_AI_ANALYZE_BYTES = 25 * MB;
const MAX_UPLOAD_BYTES = 250 * MB;
const formatFileSize = (bytes: number) => `${(bytes / MB).toFixed(bytes >= 10 * MB ? 1 : 2)} MB`;
const documentStatusLabel = (status?: Document["status"]) => status === "INDEXED" ? "Đã lập chỉ mục" : status === "FAILED" ? "Xử lý thất bại" : "Đang xử lý AI";
const documentStatusClass = (status?: Document["status"]) => status === "INDEXED" ? "badge-green" : status === "FAILED" ? "badge-red" : "badge-amber";
const isDocumentTypeFolder = (node?: FolderNode): node is FolderNode => !!node && ["standard_folder","folder","document_type_folder"].includes(node.type);

export default function Repository() {
  const { request, user } = useAuth();
  const { tasks: uploadTasks, startUpload, removeTask } = useUploadTasks();
  const router = useRouter();
  const { data, loading, error, reload } = useBackendData("/api/dashboard", empty);
  const { data: folderTree, reload: reloadFolderTree } = useBackendData<FolderTree>("/api/folders/tree", {});
  const { data: myFolderTree, reload: reloadMyFolderTree } = useBackendData<MyFolderTree>("/api/my-folder-tree", emptyMyTree);
  const [selected,setSelected]=useState<Document|null>(null);
  const [selectedFolder,setSelectedFolder]=useState("");
  const [query,setQuery]=useState("");
  const [uploadOpen,setUploadOpen]=useState(false);
  const [editorOpen,setEditorOpen]=useState(false);
  const [editing,setEditing]=useState<Document|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [uploadAsNew,setUploadAsNew]=useState(false);
  const [metadata,setMetadata]=useState({title:"",topic:"",doc_type:DEFAULT_DOCUMENT_TYPE,visibility:"public",folder_path:"",folder_node_id:"",specialization_id:"",course_id:""});
  const [destinationSource,setDestinationSource]=useState<""|"manual"|"ai">("");
  const [destinationChatInput,setDestinationChatInput]=useState("");
  const [destinationChatMessages,setDestinationChatMessages]=useState<DestinationChatMessage[]>([
    {role:"assistant",content:"Nếu AI chưa tìm được nơi lưu phù hợp, hãy mô tả tài liệu cần lưu vào học phần/folder nào. Mình chỉ chọn trong nhánh bạn có quyền; yêu cầu tạo ngành/học phần mới sẽ gửi admin duyệt."},
  ]);
  const [destinationChatBusy,setDestinationChatBusy]=useState(false);
  const [aiPanelPrompt,setAiPanelPrompt]=useState("");
  const [aiPanelBusy,setAiPanelBusy]=useState(false);
  const [newFolderName,setNewFolderName]=useState("");
  const [newFolderParent,setNewFolderParent]=useState("");
  const [folderRequestBusy,setFolderRequestBusy]=useState(false);
  const [folderRequestSent,setFolderRequestSent]=useState(false);
  const [documentTypeTouched,setDocumentTypeTouched]=useState(false);
  const [autoAnalyzing,setAutoAnalyzing]=useState(false);
  const [form,setForm]=useState<DocumentForm>(emptyForm);
  const [busy,setBusy]=useState(false);
  const [startingUpload,setStartingUpload]=useState(false);
  const [launchedTaskId,setLaunchedTaskId]=useState("");
  const [autoConfirmTaskId,setAutoConfirmTaskId]=useState("");
  const [message,setMessage]=useState("");
  const [successMsg,setSuccessMsg]=useState("");
  const virtualFolderTree=useMemo(()=>myFolderTree.children.length?folderTreeFromNodes(myFolderTree.children,data.documents):folderTree,[myFolderTree.children,data.documents,folderTree]);
  const folderOptions=useMemo(()=>flattenFolderNodes(myFolderTree.children),[myFolderTree.children]);
  const docs=useMemo(()=>data.documents.filter(x=>(!selectedFolder||x.folder_path===selectedFolder||x.folder_path.endsWith(`/${selectedFolder}`))&&`${x.title} ${x.topic} ${x.doc_type}`.toLowerCase().includes(query.toLowerCase())),[data.documents,query,selectedFolder]);
  const current=selected||docs[0]||null;
  const updateCandidate=useMemo(()=>data.documents.find(document=>document.owner_code===user?.code&&document.title.trim().toLocaleLowerCase("vi")===metadata.title.trim().toLocaleLowerCase("vi"))||null,[data.documents,metadata.title,user?.code]);
  const canManage=(document:Document)=>user?.role==="admin"||document.owner_code===user?.code;
  const allowedDestinationOptions=useMemo(()=>folderOptions.filter(option=>["course","standard_folder","folder","document_type_folder"].includes(option.type)),[folderOptions]);
  const completedUploads=uploadTasks.filter(task=>task.status==="completed").length;
  const launchedTask=uploadTasks.find(task=>task.id===launchedTaskId);
  const launchedProgress=launchedTask?Math.round(launchedTask.uploaded_bytes/launchedTask.total_bytes*100):0;
  const launchedActive=!!launchedTask&&!["completed","failed","pending_confirmation"].includes(launchedTask.status);
  const classificationTicket=launchedTask?.metadata.classification_ticket;
  const launchedSourceLabel=labelForUploadSource(launchedTask?.metadata.source_type);
  const finalDestination=useMemo(()=>{
    const selectedByPath=metadata.folder_path?folderOptions.find(option=>option.path===metadata.folder_path):undefined;
    const selectedNode=metadata.folder_node_id?folderOptions.find(option=>option.id===metadata.folder_node_id):selectedByPath;
    const selectedCourse=metadata.course_id?folderOptions.find(option=>option.id===metadata.course_id):undefined;
    const aiCourse=classificationTicket?.suggested_course_id?folderOptions.find(option=>option.id===classificationTicket.suggested_course_id):undefined;
    if(selectedNode){
      const isFolder=isDocumentTypeFolder(selectedNode);
      const selectedPath=selectedNode.path;
      return {
        source:"manual" as const,
        badge:"Chọn thủ công",
        specialization_id:metadata.specialization_id||null,
        course_id:selectedNode.type==="course"?selectedNode.id:(selectedNode.parent_id||selectedCourse?.id||metadata.course_id||null),
        folder_node_id:isFolder?selectedNode.id:null,
        document_type:isFolder?selectedNode.name:metadata.doc_type,
        path:isFolder?selectedPath:`${selectedPath}/${metadata.doc_type}`,
      };
    }
    if(metadata.course_id&&selectedCourse){
      return {source:"manual" as const,badge:"Chọn thủ công",specialization_id:metadata.specialization_id||null,course_id:metadata.course_id,folder_node_id:null,document_type:metadata.doc_type,path:`${selectedCourse.path}/${metadata.doc_type}`};
    }
    if(destinationSource==="ai"&&classificationTicket?.suggested_course_id){
      const documentType=documentTypeTouched?metadata.doc_type:(classificationTicket.suggested_document_type||metadata.doc_type);
      const coursePath=aiCourse?.path||[classificationTicket.suggested_specialization,classificationTicket.suggested_course].filter(Boolean).join("/");
      return {source:"ai" as const,badge:"Theo gợi ý AI",specialization_id:classificationTicket.suggested_specialization_id||null,course_id:classificationTicket.suggested_course_id,folder_node_id:null,document_type:documentType,path:[coursePath,documentType].filter(Boolean).join("/")};
    }
    if(metadata.folder_path){
      return {source:"manual" as const,badge:"Chọn thư mục cũ",specialization_id:metadata.specialization_id||null,course_id:null,folder_node_id:null,document_type:metadata.doc_type,path:metadata.folder_path};
    }
    return {source:"" as const,badge:"Chưa chọn",specialization_id:metadata.specialization_id||null,course_id:null,folder_node_id:null,document_type:metadata.doc_type,path:""};
  },[classificationTicket,destinationSource,documentTypeTouched,folderOptions,metadata]);

  useEffect(()=>{
    if(completedUploads)void Promise.all([reload(),reloadFolderTree(),reloadMyFolderTree()]);
  },[completedUploads,reload,reloadFolderTree,reloadMyFolderTree]);

  // Auto-apply AI suggestion when classification arrives with sufficient confidence
  useEffect(()=>{
    if(!launchedTask||launchedTask.status!=="pending_confirmation")return;
    if(destinationSource)return; // already chosen
    const ticket=launchedTask.metadata.classification_ticket;
    if(!ticket)return;
    if(ticket.suggested_course_id&&ticket.confidence>=0.65){
      setDestinationSource("ai");
    } else if(!ticket.suggested_course_id){
      // No match in policy tree — fall back to folder_path derived from topic/doc_type
      const fallbackPath=[ticket.suggested_specialization||metadata.topic,ticket.suggested_course||metadata.doc_type].filter(Boolean).join("/");
      if(fallbackPath){
        setMetadata(x=>({...x,folder_path:fallbackPath}));
        setDestinationSource("manual");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[launchedTask?.id,launchedTask?.status,launchedTask?.metadata.classification_ticket]);

  useEffect(()=>{
    if(!launchedTask||launchedTask.status!=="pending_confirmation"||autoConfirmTaskId===launchedTask.id||startingUpload)return;
    if(finalDestination.source&&(finalDestination.course_id||finalDestination.folder_node_id||finalDestination.path)){
      setAutoConfirmTaskId(launchedTask.id);
      void submitUploadDestination(finalDestination);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[launchedTask?.id,launchedTask?.status,autoConfirmTaskId,startingUpload,finalDestination.path]);

  function normalizeSearch(value:string){
    return value.normalize("NFD").replace(/[̀-ͯ]/g,"").toLocaleLowerCase("vi").replace(/đ/g,"d").replace(/[^a-z0-9]+/g," ").trim();
  }

  function tokenSimilarity(a:string,b:string){
    if(!a||!b)return 0;
    if(a===b)return 1;
    if(a.includes(b)||b.includes(a))return 0.82;
    const m=a.length,n=b.length;
    const dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(__,j)=>i?j?0:j:j));
    for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
    return 1-dp[m][n]/Math.max(m,n);
  }

  function textMatchScore(haystack:string,needle:string){
    const text=normalizeSearch(haystack);
    const target=normalizeSearch(needle);
    if(!text||!target)return 0;
    if(text.includes(target))return 8;
    const textTokens=text.split(/\s+/).filter(Boolean);
    const targetTokens=target.split(/\s+/).filter(Boolean);
    return targetTokens.reduce((sum,token)=>sum+Math.max(0,...textTokens.map(item=>tokenSimilarity(item,token))),0);
  }

  function inferDocumentType(text:string){
    const normalized=normalizeSearch(text);
    return DOCUMENT_TYPES.find(type=>normalized.includes(normalizeSearch(type)))||metadata.doc_type;
  }

  function specializationFor(option:FolderNode&{depth:number}){
    const byId=new Map(folderOptions.map(item=>[item.id,item]));
    let current:((FolderNode&{depth:number})|undefined)=option;
    while(current&&current.type!=="specialization")current=current.parent_id?byId.get(current.parent_id):undefined;
    return current;
  }

  function destinationFromOption(option:FolderNode&{depth:number}, source:"manual"|"ai"="manual", docType?:string):UploadDestination{
    const spec=specializationFor(option);
    const folderTypes=["standard_folder","folder","document_type_folder"];
    const isFolderNode=folderTypes.includes(option.type);
    const documentType=isFolderNode?option.name:(docType||metadata.doc_type);
    const courseId=option.type==="course"?option.id:(option.parent_id||metadata.course_id||null);
    return {
      source,
      badge:source==="ai"?"Theo gợi ý AI":"Chọn thủ công",
      specialization_id:spec?.id||metadata.specialization_id||null,
      course_id:courseId,
      folder_node_id:isFolderNode?option.id:null,
      document_type:documentType,
      path:isFolderNode?option.path:`${option.path}/${documentType}`,
    };
  }

  function applyDestinationOption(option:FolderNode&{depth:number}, source:"manual"|"ai"="manual", docType?:string){
    const destination=destinationFromOption(option,source,docType);
    setDestinationSource(source);
    setDocumentTypeTouched(!!destination.folder_node_id||!!docType);
    setMetadata(current=>({
      ...current,
      specialization_id:destination.specialization_id||current.specialization_id,
      course_id:destination.course_id||current.course_id,
      folder_node_id:destination.folder_node_id||"",
      folder_path:destination.folder_node_id?destination.path:"",
      topic:current.topic||option.name,
      doc_type:destination.document_type,
    }));
    return destination;
  }

  function findDestinationMatch(text:string){
    const normalized=normalizeSearch(`${text} ${metadata.title} ${metadata.topic}`);
    const docType=inferDocumentType(text);
    const scored=allowedDestinationOptions.map(option=>{
      const name=normalizeSearch(option.name);
      let score=0;
      score+=textMatchScore(normalized,option.path);
      score+=textMatchScore(normalized,option.name)*1.5;
      const courseHint=option.type==="course"?option:folderOptions.find(item=>item.id===option.parent_id);
      if(courseHint)score+=textMatchScore(normalized,courseHint.name)*2;
      if(isDocumentTypeFolder(option)&&normalizeSearch(docType)===name)score+=4;
      if(option.type==="course")score+=1;
      return {option,score};
    }).filter(item=>item.score>=2.2).sort((a,b)=>b.score-a.score);
    return scored[0]?{...scored[0],docType}:null;
  }

  function autoSelectDestination(text:string){
    const match=findDestinationMatch(text);
    if(!match)return false;
    const destination=applyDestinationOption(match.option,"ai",match.docType);
    setDestinationChatMessages(current=>[...current,{role:"assistant",content:`Mình đã tự chọn nơi lưu phù hợp: ${destination.path}. Nếu đúng rồi bạn chỉ cần tiếp tục tải lên/lưu.`}]);
    return true;
  }

  async function sendDestinationChat(){
    const text=destinationChatInput.trim();
    if(!text)return;
    setDestinationChatInput("");
    setDestinationChatMessages(current=>[...current,{role:"user",content:text}]);
    const normalized=normalizeSearch(text);

    // Detect "create folder" intent — broader pattern covering "tạo thư mục", "thêm thư mục", "tạo folder", etc.
    const asksCreateFolder=/(tao|them|tao moi|tao them).*(thu muc|folder|nhanh|cap|hon)|(thu muc|folder).*(moi|them|chua co)/.test(normalized);
    const asksForPolicyChange=asksCreateFolder||/(tao|them|bo sung|cap nhat|de xuat|yeu cau).*(nganh|chuyen nganh|nhom chuyen mon|hoc phan|mon|cap 2|policy)/.test(normalized);

    if(asksCreateFolder){
      // Extract folder name from message — look for quoted name or words after "là", "tên", "con là"
      const nameMatch=text.match(/(?:là|tên|tên là|con là|folder|thư mục con là|thư mục)\s+([A-Za-z0-9À-ỹ\s]+?)(?:\s+(?:trong|thuộc|ở|của|để|cho)|$)/i);
      const folderName=nameMatch?nameMatch[1].trim():"";
      // Extract parent context
      const parentMatch=text.match(/(?:trong|thuộc|ở|của)\s+([A-Za-z0-9À-ỹ\s()\-]+?)(?:\s+(?:để|cho|lưu)|$)/i);
      const parentHint=parentMatch?parentMatch[1].trim():"";
      setDestinationChatBusy(true);
      try{
        await request("/api/folders/request-create",{method:"POST",body:JSON.stringify({folder_name:folderName||text.slice(0,60),parent_path:parentHint,reason:text})});
        // Also try to find the closest existing path to use as temp destination
        const match=findDestinationMatch(text);
        let tempPath=finalDestination.path||"";
        if(match){
          const dest=applyDestinationOption(match.option,"manual",match.docType);
          tempPath=dest.path;
        }
        const folderLabel=folderName?`"${folderName}"`:"thư mục mới";
        setDestinationChatMessages(current=>[...current,{role:"assistant",content:`Đã gửi yêu cầu tạo ${folderLabel} tới admin duyệt.${tempPath?` Trong lúc chờ, mình đã đặt đường dẫn tạm: ${tempPath}. Bạn vẫn có thể tải lên ngay.`:""}`}]);
      }catch(err){
        setDestinationChatMessages(current=>[...current,{role:"assistant",content:err instanceof Error?err.message:"Không gửi được yêu cầu tạo thư mục."}]);
      }finally{
        setDestinationChatBusy(false);
      }
      return;
    }

    const match=findDestinationMatch(text);
    if(match&&!asksForPolicyChange){
      const destination=applyDestinationOption(match.option,"manual",match.docType);
      const readyToSave=launchedTask?.status==="pending_confirmation";
      setDestinationChatMessages(current=>[...current,{role:"assistant",content:readyToSave?`Mình đã chọn nơi lưu: ${destination.path}. Đang tự động lưu tài liệu cho bạn.`:`Mình đã chọn nơi lưu: ${destination.path}. Bạn có thể bấm Bắt đầu tải lên.`}]);
      if(readyToSave)await submitUploadDestination(destination);
      return;
    }
    if(match&&asksForPolicyChange){
      applyDestinationOption(match.option,"manual",match.docType);
      setDestinationChatMessages(current=>[...current,{role:"assistant",content:`Mình tìm được nhánh gần nhất và đã chọn tạm: ${match.option.path}. Yêu cầu tạo ngành/học phần mới đã được ghi nhận, admin sẽ duyệt sau.`}]);
      return;
    }
    if(asksForPolicyChange){
      setDestinationChatBusy(true);
      try{
        const result=await request<{id:string;message:string}>("/api/uploads/folder-change-request",{method:"POST",body:JSON.stringify({prompt:text,title:metadata.title,topic:metadata.topic,current_destination:finalDestination.path||""})});
        setDestinationChatMessages(current=>[...current,{role:"assistant",content:`${result.message} Mã yêu cầu: ${result.id}.`}]);
      }catch(err){
        setDestinationChatMessages(current=>[...current,{role:"assistant",content:err instanceof Error?err.message:"Không gửi được yêu cầu admin."}]);
      }finally{
        setDestinationChatBusy(false);
      }
      return;
    }
    // Last resort: try AI course suggestion
    setDestinationChatBusy(true);
    try{
      const r=await request<{folder_node_id?:string;folder_path?:string;course?:string;confidence?:number}>("/api/folders/suggest-course",{method:"POST",body:JSON.stringify({description:text})});
      if(r.folder_node_id||r.folder_path){
        setMetadata(x=>({...x,folder_node_id:r.folder_node_id||x.folder_node_id,folder_path:r.folder_path||x.folder_path}));
        setDestinationSource("ai");
        setDestinationChatMessages(current=>[...current,{role:"assistant",content:`Mình đã tìm được nơi lưu phù hợp: ${r.folder_path||r.course}. Đã cập nhật vào ô AI đề xuất.`}]);
      }else{
        setDestinationChatMessages(current=>[...current,{role:"assistant",content:"Mình chưa tìm thấy học phần phù hợp. Hãy mô tả rõ tên học phần hoặc gõ \"tạo thư mục [tên]\" để gửi yêu cầu tới admin."}]);
      }
    }catch{
      setDestinationChatMessages(current=>[...current,{role:"assistant",content:"Mình chưa tìm thấy học phần phù hợp. Hãy mô tả rõ tên học phần hoặc gõ \"tạo thư mục [tên]\" để gửi yêu cầu tới admin."}]);
    }finally{
      setDestinationChatBusy(false);
    }
  }

  function applyAiSuggestion(){
    if(!classificationTicket?.suggested_course_id)return;
    setDestinationSource("ai");
    setDocumentTypeTouched(false);
    setMetadata(x=>({
      ...x,
      folder_node_id:"",
      folder_path:"",
      specialization_id:classificationTicket.suggested_specialization_id||x.specialization_id,
      course_id:classificationTicket.suggested_course_id||x.course_id,
      topic:x.topic||classificationTicket.suggested_course||classificationTicket.suggested_specialization||"",
      visibility:classificationTicket.suggested_visibility||x.visibility,
      doc_type:classificationTicket.suggested_document_type||x.doc_type,
    }));
  }

  function selectManualFolder(option:(FolderNode&{depth:number})|undefined){
    const typeFolder=isDocumentTypeFolder(option);
    setDestinationSource(option?"manual":"");
    setDocumentTypeTouched(typeFolder?true:documentTypeTouched);
    setMetadata(x=>({
      ...x,
      folder_node_id:option?.id||"",
      folder_path:option?.path||"",
      course_id:option?.type==="course"?option.id:typeFolder?(option?.parent_id||""):"",
      doc_type:typeFolder&&option?option.name:x.doc_type,
    }));
  }

  function selectFolderPath(folder_path:string){
    const option=folderOptions.find(item=>item.path===folder_path);
    if(option){
      selectManualFolder(option);
      return;
    }
    setDestinationSource(folder_path?"manual":"");
    setMetadata(x=>({...x,folder_path,folder_node_id:"",course_id:"",specialization_id:""}));
  }

  function selectFile(nextFile:File|null){
    setFile(nextFile);
    setLaunchedTaskId("");
    setAutoConfirmTaskId("");
    setMessage("");
    setDestinationSource("");
    setDestinationChatInput("");
    setDestinationChatMessages([
      {role:"assistant",content:"Nếu AI chưa tìm được nơi lưu phù hợp, hãy mô tả tài liệu cần lưu vào học phần/folder nào. Mình chỉ chọn trong nhánh bạn có quyền; yêu cầu tạo ngành/học phần mới sẽ gửi admin duyệt."},
    ]);
    setDocumentTypeTouched(false);
    if(!nextFile)return;
    setMetadata(x=>({...x,title:nextFile.name.replace(/\.[^.]+$/,"").replaceAll("_"," "),topic:"",doc_type:DEFAULT_DOCUMENT_TYPE}));
    if(nextFile.size>MAX_UPLOAD_BYTES){
      setMessage(`File ${formatFileSize(nextFile.size)} vượt giới hạn tải lên 250 MB.`);
    }else if(nextFile.size>MAX_AI_ANALYZE_BYTES){
      setMessage(`File ${formatFileSize(nextFile.size)} sẽ được tải theo từng phần và AI phân tích ở chế độ nền.`);
    }else{
      window.setTimeout(()=>autoSelectDestination(nextFile.name),0);
      void analyzeFile(nextFile);
    }
  }

  async function analyzeFile(nextFile:File){
    setAutoAnalyzing(true);
    try{
      const result=await request<{metadata:{title:string;topic:string;doc_type:string};folder_path:string;folder_node_id?:string}>("/api/documents/analyze-file",{
        method:"POST",
        headers:{"x-filename":encodeURIComponent(nextFile.name),"content-type":nextFile.type||"application/octet-stream"},
        body:nextFile,
      });
      setMetadata(x=>({
        ...x,
        title:result.metadata.title||x.title,
        topic:result.metadata.topic||"",
        doc_type:result.metadata.doc_type||x.doc_type,
        folder_path:x.folder_path||result.folder_path||"",
        folder_node_id:x.folder_node_id||result.folder_node_id||"",
      }));
      window.setTimeout(()=>autoSelectDestination(`${nextFile.name} ${result.metadata.title||""} ${result.metadata.topic||""} ${result.metadata.doc_type||""}`),0);
    }catch{
      // AI phân tích thất bại — người dùng nhập thủ công
    }finally{
      setAutoAnalyzing(false);
    }
  }

  async function submitAiPanelPrompt(){
    if(!aiPanelPrompt.trim()||aiPanelBusy)return;
    setAiPanelBusy(true);
    try{
      const r=await request<{folder_node_id?:string;folder_path?:string;course?:string;specialization?:string;confidence?:number}>("/api/folders/suggest-course",{method:"POST",body:JSON.stringify({description:aiPanelPrompt})});
      if(r.folder_node_id||r.folder_path){
        setMetadata(x=>({...x,folder_node_id:r.folder_node_id||x.folder_node_id,folder_path:r.folder_path||x.folder_path}));
        setDestinationSource("ai");
      }
      setAiPanelPrompt("");
    }catch{}finally{setAiPanelBusy(false);}
  }

  async function submitFolderRequest(){
    if(!newFolderName.trim()||folderRequestBusy)return;
    setFolderRequestBusy(true);
    try{
      await request("/api/folders/request-create",{method:"POST",body:JSON.stringify({folder_name:newFolderName,parent_path:newFolderParent,reason:"Yêu cầu từ trang tải lên"})});
      setFolderRequestSent(true);
      setNewFolderName("");setNewFolderParent("");
    }catch{}finally{setFolderRequestBusy(false);}
  }

  function openCreate(){
    setEditing(null);setForm(emptyForm);setMessage("");setEditorOpen(true);
  }

  async function openEdit(document:Document){
    setBusy(true);setMessage("");
    try{
      const detail=await request<DocumentDetail>(`/api/documents/${document.id}`);
      setEditing(document);
      setForm({title:detail.title,topic:detail.topic,doc_type:detail.doc_type,visibility:detail.visibility,folder_path:detail.folder_path||"",folder_node_id:detail.folder_node_id||"",content:detail.content});
      setEditorOpen(true);
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể mở tài liệu để sửa.");}
    finally{setBusy(false);}
  }

  async function saveDocument(){
    setBusy(true);setMessage("");
    try{
      await request(editing?`/api/documents/${editing.id}`:"/api/documents",{method:editing?"PUT":"POST",body:JSON.stringify(form)});
      setEditorOpen(false);setEditing(null);await reload();
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể lưu tài liệu.");}
    finally{setBusy(false);}
  }

  async function removeDocument(document:Document){
    if(!confirm(`Đưa "${document.title}" vào thùng rác?`))return;
    setBusy(true);setMessage("");
    try{
      await request(`/api/documents/${document.id}`,{method:"DELETE"});
      if(selected?.id===document.id)setSelected(null);
      await reload();
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể xóa tài liệu.");}
    finally{setBusy(false);}
  }

  async function uploadFile(){
    if(!file)return;
    if(file.size>MAX_UPLOAD_BYTES){setMessage("File vượt giới hạn tải lên 250 MB.");return;}
    setStartingUpload(true);setMessage("");
    try{
      const updateExisting=updateCandidate&&!uploadAsNew;
      const taskId=await startUpload(file,{...metadata,visibility:metadata.visibility as "public"|"private",existing_document_id:updateExisting?updateCandidate.id:undefined});
      setLaunchedTaskId(taskId);
    }catch(err){setMessage(err instanceof Error?err.message:"Tải lên thất bại.");}
    finally{setStartingUpload(false);}
  }

  async function submitUploadDestination(destination:UploadDestination){
    if(!launchedTask||launchedTask.status!=="pending_confirmation")return;
    setStartingUpload(true);setMessage("");
    try{
      if(!destination.source){setMessage("Vui lòng chọn nơi lưu tài liệu.");return;}
      if(myFolderTree.policy&&!destination.course_id&&!destination.folder_node_id&&!destination.path){
        setMessage("Policy đang active: vui lòng chọn học phần hoặc folder chuẩn trong cây tri thức.");
        return;
      }
      const finalPayload={specialization_id:destination.specialization_id,course_id:destination.course_id,folder_node_id:destination.folder_node_id,folder_path:(!destination.course_id&&!destination.folder_node_id)?metadata.folder_path||null:null,document_type:destination.document_type,visibility:metadata.visibility,final_destination_source:destination.source||null};
      await request(`/api/uploads/${launchedTask.id}/confirm`,{method:"POST",body:JSON.stringify(finalPayload)});
      await Promise.all([reload(),reloadFolderTree(),reloadMyFolderTree()]);
      setSuccessMsg(`Đã lưu "${metadata.title}" thành công!`);
      setTimeout(()=>{setUploadOpen(false);setFile(null);setLaunchedTaskId("");setSuccessMsg("");},2000);
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể xác nhận lưu tài liệu.");}
    finally{setStartingUpload(false);}
  }

  async function confirmUpload(){
    await submitUploadDestination(finalDestination);
  }

  async function cancelLaunchedUpload(){
    if(!launchedTask)return;
    if(!confirm("Bạn có chắc muốn hủy file upload này không?"))return;
    setStartingUpload(true);setMessage("");
    try{
      await removeTask(launchedTask.id, true);
      setLaunchedTaskId("");
      setFile(null);
    }catch(err){setMessage(err instanceof Error?err.message:"Không thể hủy tải lên.");}
    finally{setStartingUpload(false);}
  }

  return <div className="pb-12">
      <PageHeader eyebrow="Kho tri thức" title="Kho tài liệu" description={`${data.stats.documents} tài liệu đang được lưu trong hệ thống.`} actions={<><button className="btn-secondary app-card !bg-white/60 hover:!bg-white/90 shadow-sm" onClick={openCreate}><FilePlus2 size={15} className="text-blue-600"/>Tạo tài liệu</button><button className="btn-primary shadow-lg shadow-blue-500/30" onClick={()=>{setMessage("");setUploadOpen(true)}}><Upload size={15}/>Tải tệp lên</button></>}/>
      {(error||message||myFolderTree.message)&&<p className="mb-4 rounded bg-amber-50 p-3 text-xs text-amber-800 shadow-sm">{error||message||myFolderTree.message}</p>}
      <div className="grid gap-6 transition-all duration-300 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start mt-4">
        <section className="app-card min-w-0 overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between gap-3 border-b border-white/40 dark:border-white/5 px-5 py-4 bg-white/30 dark:bg-slate-800/30"><div><h2 className="section-title">{myFolderTree.policy?"Kho của tôi theo cây tri thức chuẩn":"Kho tài liệu"}</h2><p className="muted mt-0.5 text-xs font-medium">{myFolderTree.policy?`Chính sách đang áp dụng: ${myFolderTree.policy.title}`:"Dùng đường dẫn thư mục hiện có"}</p></div></div>
          <div className="p-2"><FolderNavigation tree={virtualFolderTree} selectedPath={selectedFolder} selectedFileId={selected?.id||""} onSelectFolder={path=>{setSelectedFolder(path);setSelected(null)}} onOpenFile={id=>router.push(`/documents/${id}`)}/></div>
        </section>
        <section className="app-card overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between gap-3 border-b border-white/40 dark:border-white/5 px-5 py-4 bg-white/30 dark:bg-slate-800/30">
            <div><h2 className="section-title">{selectedFolder||"Tất cả tài liệu"}</h2><p className="muted mt-0.5 text-xs font-medium">{loading?"Đang tải...":`${docs.length} tài liệu`}</p></div>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-white/40 dark:border-white/5 p-4"><div className="relative min-w-48 flex-1"><Search className="muted absolute left-3 top-2.5 text-blue-500" size={15}/><input className="field bg-white/60 dark:bg-slate-800/50 backdrop-blur-md border-white/80 dark:border-slate-700 focus:bg-white/90 dark:focus:bg-slate-800 transition-colors shadow-inner" style={{ paddingLeft: '36px' }} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tìm tài liệu trong thư mục..."/></div><button className="icon-btn bg-white/60 dark:bg-slate-800/50 dark:border-slate-700 hover:bg-white/90 dark:hover:bg-slate-700 shadow-sm" aria-label="Dạng danh sách"><List size={15}/></button><button className="icon-btn bg-white/60 dark:bg-slate-800/50 dark:border-slate-700 hover:bg-white/90 dark:hover:bg-slate-700 shadow-sm" aria-label="Dạng lưới"><LayoutGrid size={15}/></button></div>
          <div className="table-shell"><table className="data-table"><thead><tr className="bg-white/20 dark:bg-slate-800/40"><th className="font-bold text-gray-700 dark:text-gray-200">Tên</th><th className="font-bold text-gray-700 dark:text-gray-200">Loại</th><th className="font-bold text-gray-700 dark:text-gray-200">Chủ sở hữu</th><th className="font-bold text-gray-700 dark:text-gray-200">Cập nhật</th><th className="font-bold text-gray-700 dark:text-gray-200">Quyền</th><th className="font-bold text-gray-700 dark:text-gray-200">Thao tác</th></tr></thead><tbody>{docs.map(d=><tr key={d.id} onClick={()=>setSelected(d)} className={`tech-hover-row cursor-pointer border-b border-white/20 dark:border-white/10 ${current?.id===d.id?"bg-[color-mix(in_srgb,var(--soft)_80%,transparent)]":""}`}><td><div className="flex items-center gap-3"><div className="relative h-11 w-11 rounded-2xl bg-gradient-to-br from-white/90 to-amber-50/40 dark:from-slate-800/80 dark:to-slate-900/60 border border-amber-200/60 dark:border-amber-500/30 text-amber-500 dark:text-amber-300 grid place-items-center shadow-[inset_0_0_12px_rgba(251,191,36,0.2)] dark:shadow-[inset_0_0_20px_rgba(251,191,36,0.3)] overflow-hidden"><div className="absolute inset-0 bg-amber-400/30 dark:bg-amber-400/20 blur-xl animate-pulse"></div><File size={20} className="relative z-10 drop-shadow-[0_0_6px_rgba(251,191,36,0.9)] animate-pulse" /></div><div><Link href={`/documents/${d.id}`} className="font-bold text-gray-800 dark:text-amber-50 hover:text-amber-600 dark:hover:text-amber-300 dark:hover:drop-shadow-[0_0_10px_rgba(251,191,36,0.5)] transition-all text-base">{d.title}</Link><span className="text-gray-500 dark:text-amber-100/60 block text-sm mt-0.5 font-medium">{d.topic}</span><span className={`badge mt-1 shadow-sm ${documentStatusClass(d.status)}`}>{documentStatusLabel(d.status)}</span></div></div></td><td><span className="font-medium text-gray-600 dark:text-gray-300">{d.doc_type}</span></td><td><span className="font-medium text-gray-600 dark:text-gray-300">{d.owner_code}</span></td><td><span className="text-gray-500 dark:text-gray-400 text-xs">{formatDate(d.updated_at)}</span></td><td><span className={`badge shadow-sm ${d.visibility==="public"?"badge-green":"badge-amber"}`}>{visibilityLabel(d.visibility)}</span></td><td>{canManage(d)&&<div className="flex gap-1"><button className="icon-btn bg-white/70 dark:bg-slate-800 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-slate-700 shadow-sm" aria-label="Sửa tài liệu" disabled={busy} onClick={e=>{e.stopPropagation();openEdit(d)}}><FilePenLine size={15} className="text-blue-600 dark:text-blue-400"/></button><button className="icon-btn bg-white/70 dark:bg-slate-800 dark:border-slate-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 shadow-sm" aria-label="Xóa tài liệu" disabled={busy} onClick={e=>{e.stopPropagation();removeDocument(d)}}><Trash2 size={15}/></button></div>}</td></tr>)}</tbody></table></div>
          {!docs.length&&<p className="muted p-12 text-center text-sm font-medium">Thư mục này chưa có tài liệu trực tiếp.</p>}
        </section>
      </div>
    {editorOpen&&<Modal onClose={()=>setEditorOpen(false)}><p className="eyebrow">{editing?"Chỉnh sửa tài liệu":"Tạo tài liệu thủ công"}</p><h2 className="page-title mt-1">{editing?"Cập nhật tài liệu":"Thêm tài liệu mới"}</h2><DocumentFields form={form} setForm={setForm}/>{message&&<p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">{message}</p>}<div className="mt-5 flex justify-end gap-2"><button className="btn-secondary" onClick={()=>setEditorOpen(false)}>Hủy</button><button disabled={busy||!form.title||!form.topic||!form.content} className="btn-primary" onClick={saveDocument}>{busy&&<LoaderCircle className="animate-spin" size={15}/>}Lưu tài liệu</button></div></Modal>}
    {uploadOpen&&<Modal onClose={()=>{setUploadOpen(false);setFolderRequestSent(false);setNewFolderName("");setNewFolderParent("");setAiPanelPrompt("");}}><p className="eyebrow">Nhập tài liệu có hỗ trợ AI</p><h2 className="page-title mt-1">Tải tài liệu mới</h2><label className="mini-grid mt-5 block rounded-xl border-2 border-dashed border-blue-300 p-8 text-center"><Upload className="mx-auto text-blue-600"/><strong className="mt-3 block text-sm">{file?.name||"Chọn tệp để tải lên"}</strong>{file&&<span className="muted mt-1 block text-xs">{formatFileSize(file.size)} · tải theo chunk · AI xử lý nền · tối đa 250 MB</span>}<input type="file" className="hidden" disabled={launchedActive} onChange={e=>selectFile(e.target.files?.[0]||null)}/></label><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="relative"><input className={`field w-full pr-8 ${autoAnalyzing?"opacity-60":""}`} placeholder={autoAnalyzing?"AI đang đọc tài liệu...":"Tên tài liệu"} value={metadata.title} disabled={autoAnalyzing} onChange={e=>{setMetadata(x=>({...x,title:e.target.value}));setUploadAsNew(false)}}/>{autoAnalyzing&&<LoaderCircle className="animate-spin absolute right-2.5 top-2.5 text-blue-500" size={14}/>}</div><div className="relative"><input className={`field w-full pr-8 ${autoAnalyzing?"opacity-60":""}`} placeholder={autoAnalyzing?"Đang phân tích...":"Chủ đề"} value={metadata.topic} disabled={autoAnalyzing} onChange={e=>setMetadata(x=>({...x,topic:e.target.value}))}/>{autoAnalyzing&&<LoaderCircle className="animate-spin absolute right-2.5 top-2.5 text-blue-500" size={14}/>}</div><select className="field" value={metadata.doc_type} disabled={autoAnalyzing} onChange={e=>{setDocumentTypeTouched(true);setMetadata(x=>({...x,doc_type:e.target.value}))}}>{DOCUMENT_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</select><select className="field" value={metadata.visibility} onChange={e=>setMetadata(x=>({...x,visibility:e.target.value as "public"|"private"}))}><option value="public">Công khai</option><option value="private">Riêng tư</option></select>{updateCandidate&&<div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900"><strong className="block">Đã có tài liệu cùng tên: v{updateCandidate.current_version}</strong><p className="mt-1">Mặc định file này sẽ trở thành phiên bản v{updateCandidate.current_version+1}. Bản cũ vẫn được giữ để so sánh, tải xuống và backup.</p><label className="mt-3 flex items-center gap-2 font-semibold"><input type="checkbox" checked={uploadAsNew} onChange={e=>setUploadAsNew(e.target.checked)}/>Tạo thành tài liệu mới riêng biệt</label></div>}</div>
{/* === 2-PANEL DESTINATION PICKER (pre-upload + pending_confirmation) === */}
{file&&launchedTask?.status!=="pending_confirmation"&&!launchedActive&&(()=>{
  const aiNode=metadata.folder_node_id?folderOptions.find(o=>o.id===metadata.folder_node_id):undefined;
  const aiPath=aiNode?.path||(metadata.folder_path||"");
  const aiParts=aiPath?aiPath.split("/"):[];
  const hasAi=!!aiPath;
  return(
    <div className="mt-4">
      <p className="mb-3 text-sm font-semibold text-gray-700">{autoAnalyzing?"🤖 AI đang phân tích tài liệu...":"Chọn nơi lưu tài liệu"}</p>
      <div className="grid grid-cols-2 gap-3">
        {/* Panel trái: AI đề xuất */}
        <div className={`flex flex-col rounded-xl border-2 p-3 transition-all cursor-pointer ${destinationSource==="ai"&&hasAi?"border-blue-500 bg-blue-50":"border-gray-200 bg-gray-50 hover:border-blue-300"}`} onClick={()=>{if(hasAi)setDestinationSource("ai");}}>
          <div className="mb-2 flex items-center justify-between">
            <strong className="text-sm">🤖 AI đề xuất</strong>
            {autoAnalyzing&&<LoaderCircle className="animate-spin text-blue-500" size={13}/>}
          </div>
          {autoAnalyzing?(
            <div className="my-2 flex-1 space-y-2 rounded-lg bg-white p-2">
              <div className="h-3 w-3/4 animate-pulse rounded bg-gray-200"/>
              <div className="ml-3 h-3 w-2/3 animate-pulse rounded bg-gray-200"/>
              <div className="ml-6 h-3 w-1/2 animate-pulse rounded bg-gray-200"/>
            </div>
          ):hasAi?(
            <div className="my-2 flex-1 rounded-lg bg-white p-2 text-xs">
              {aiParts.map((part,i)=>(
                <div key={i} className="flex items-center gap-1" style={{marginLeft:`${i*12}px`}}>
                  <span className="text-gray-400">{i===aiParts.length-1?"📄":"📁"}</span>
                  <span className={i===aiParts.length-1?"font-semibold text-blue-700":"text-gray-700"}>{part}</span>
                </div>
              ))}
            </div>
          ):(
            <div className="my-2 flex-1 rounded-lg bg-white p-2 text-xs text-gray-500" onClick={e=>e.stopPropagation()}>
              <p className="text-gray-400">AI chưa tìm được vị trí phù hợp.</p>
              <p className="mt-1 mb-2 text-xs text-gray-400">Mô tả tài liệu để AI gợi ý nơi lưu:</p>
              <div className="flex gap-1">
                <input
                  className="field flex-1 text-xs"
                  placeholder="VD: bài giảng machine learning..."
                  value={aiPanelPrompt}
                  onChange={e=>setAiPanelPrompt(e.target.value)}
                  onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submitAiPanelPrompt();}}}
                  disabled={aiPanelBusy}
                />
                <button type="button" onClick={submitAiPanelPrompt} disabled={!aiPanelPrompt.trim()||aiPanelBusy} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                  {aiPanelBusy?"...":"→"}
                </button>
              </div>
            </div>
          )}
          <button type="button" disabled={!hasAi||autoAnalyzing} onClick={e=>{e.stopPropagation();if(hasAi)setDestinationSource("ai");}} className={`mt-auto w-full rounded-lg py-2 text-xs font-semibold transition ${destinationSource==="ai"&&hasAi?"bg-blue-500 text-white":"border border-gray-300 bg-white text-gray-700 hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40"}`}>{destinationSource==="ai"?"✓ Đã chọn":"Chọn phương án này"}</button>
        </div>
        {/* Panel phải: Chọn thủ công */}
        <div className={`flex flex-col rounded-xl border-2 p-3 transition-all ${destinationSource==="manual"?"border-blue-500 bg-blue-50":"border-gray-200 bg-gray-50"}`}>
          <strong className="mb-2 text-sm">✏️ Chọn thủ công</strong>
          <div className="my-2 flex-1 space-y-2">
            {folderOptions.length>0&&<FolderNodePicker options={folderOptions} value={metadata.folder_node_id} onChange={node=>{selectManualFolder(node);setDestinationSource("manual");}}/>}
            <FolderPicker tree={virtualFolderTree} value={metadata.folder_path} onChange={path=>{selectFolderPath(path);if(path)setDestinationSource("manual");}}/>
            <input className="field w-full text-xs" placeholder="Hoặc nhập đường dẫn thủ công..." value={metadata.folder_path} onChange={e=>{selectFolderPath(e.target.value);if(e.target.value)setDestinationSource("manual");}}/>
            {destinationSource==="manual"&&finalDestination.path&&(
              <div className="rounded-lg bg-white p-2 text-xs">
                {finalDestination.path.split("/").map((part,i,arr)=>(
                  <div key={i} className="flex items-center gap-1" style={{marginLeft:`${i*12}px`}}>
                    <span className="text-gray-400">{i===arr.length-1?"📄":"📁"}</span>
                    <span className={i===arr.length-1?"font-semibold text-blue-700":"text-gray-700"}>{part}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t pt-2">
              <p className="mb-1 text-xs font-semibold text-gray-500">📁 Yêu cầu tạo thư mục mới</p>
              {folderRequestSent?(
                <p className="rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700">✓ Đã gửi yêu cầu tới admin duyệt.</p>
              ):(
                <div className="space-y-1">
                  <input className="field w-full text-xs" placeholder="Tên thư mục mới (VD: Computer Vision)" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}/>
                  <input className="field w-full text-xs" placeholder="Thuộc thư mục cha (tuỳ chọn)" value={newFolderParent} onChange={e=>setNewFolderParent(e.target.value)}/>
                  <button type="button" onClick={submitFolderRequest} disabled={!newFolderName.trim()||folderRequestBusy} className="w-full rounded-lg border border-blue-300 bg-blue-50 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">{folderRequestBusy?"Đang gửi...":"Gửi yêu cầu tới admin"}</button>
                </div>
              )}
            </div>
          </div>
          <button type="button" disabled={destinationSource!=="manual"&&!metadata.folder_node_id&&!metadata.folder_path} onClick={()=>setDestinationSource("manual")} className={`mt-auto w-full rounded-lg py-2 text-xs font-semibold transition ${destinationSource==="manual"?"bg-blue-500 text-white":"border border-gray-300 bg-white text-gray-700 hover:border-blue-400"}`}>{destinationSource==="manual"?"✓ Đã chọn":"Chọn phương án này"}</button>
        </div>
      </div>
      {finalDestination.path&&<p className="mt-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-800">📂 Sẽ lưu vào: <span className="font-mono">{finalDestination.path}</span></p>}
    </div>
  );
})()}{launchedTask&&<div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3"><div className="flex items-center justify-between gap-2 text-xs font-bold text-blue-900"><span>{launchedTask.status==="uploading"?"Đang tải lên":launchedTask.status==="uploaded"?"Đã tải file gốc":launchedTask.status==="analyzing"?"Đang AI phân tích":launchedTask.status==="saving_metadata"?"Đang lưu metadata":launchedTask.status==="pending_confirmation"?"Chờ xác nhận phân loại":launchedTask.status==="processing"?"Đang xử lý AI":launchedTask.status==="completed"?"Đã lưu":"Thất bại"}</span><span>{launchedProgress}%</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="rounded-full border border-blue-200 bg-white px-2 py-0.5 font-semibold text-blue-700">{launchedSourceLabel}</span>{launchedTask.metadata.source_path&&<span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">Nguồn: {launchedTask.metadata.source_path}</span>}</div><div className="progress mt-2"><i style={{width:`${launchedProgress}%`}}/></div><p className="muted mt-2 text-xs">{formatFileSize(launchedTask.uploaded_bytes)} / {formatFileSize(launchedTask.total_bytes)}</p>{launchedTask.error&&<p className="mt-2 text-xs text-red-600">{launchedTask.error}</p>}</div>}{classificationTicket&&launchedTask?.status==="pending_confirmation"&&(
  <div className="mt-4">
    <div className="mb-3 flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-700">Chọn nơi lưu tài liệu</p><span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{launchedSourceLabel}</span></div>
    <div className="grid grid-cols-2 gap-3">
      {/* Panel trái: AI đề xuất */}
      <div className={`flex flex-col rounded-xl border-2 p-3 transition-all ${destinationSource==="ai"&&classificationTicket.suggested_course_id?"border-blue-500 bg-blue-50":"border-gray-200 bg-gray-50"}`}>
        <div className="mb-2 flex items-center justify-between">
          <strong className="text-sm">🤖 AI đề xuất</strong>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${classificationTicket.confidence>=0.65?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>{Math.round(classificationTicket.confidence*100)}% tin cậy</span>
        </div>
        {classificationTicket.suggested_course_id?(
          <div className="my-2 flex-1 space-y-1 rounded-lg bg-white p-2 text-xs">
            <div className="flex items-center gap-1 text-gray-500"><span>🏫</span><span className="font-medium text-gray-700">{classificationTicket.suggested_specialization||"Chuyên ngành"}</span></div>
            <div className="ml-3 flex items-center gap-1 text-gray-500"><span>📚</span><span className="font-medium text-gray-700">{classificationTicket.suggested_course||"Học phần"}</span></div>
            <div className="ml-6 flex items-center gap-1"><span>📄</span><span className="font-semibold text-blue-700">{classificationTicket.suggested_document_type||metadata.doc_type}</span></div>
            {classificationTicket.confidence<0.65&&<p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">⚠ Độ tin cậy thấp, nên kiểm tra lại</p>}
          </div>
        ):(
          <div className="my-2 flex-1 rounded-lg bg-white p-2 text-xs text-gray-500">
            <p className="text-gray-400">AI chưa tìm được học phần trong cây tri thức.</p>
            {classificationTicket.suggestions.length>0&&<div className="mt-1 mb-2 space-y-1">{classificationTicket.suggestions.slice(0,2).map(s=><p key={s.course_id} className="text-xs text-gray-400">Gợi ý: {s.course} ({Math.round(s.confidence*100)}%)</p>)}</div>}
            <p className="mb-1 text-xs text-gray-400">Mô tả để AI tìm lại nơi lưu:</p>
            <div className="flex gap-1" onClick={e=>e.stopPropagation()}>
              <input
                className="field flex-1 text-xs"
                placeholder="VD: slide môn computer vision..."
                value={aiPanelPrompt}
                onChange={e=>setAiPanelPrompt(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submitAiPanelPrompt();}}}
                disabled={aiPanelBusy}
              />
              <button type="button" onClick={e=>{e.stopPropagation();submitAiPanelPrompt();}} disabled={!aiPanelPrompt.trim()||aiPanelBusy} className="rounded-lg border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">
                {aiPanelBusy?"...":"→"}
              </button>
            </div>
          </div>
        )}
        <button type="button" disabled={!classificationTicket.suggested_course_id&&!metadata.folder_node_id&&!metadata.folder_path} onClick={()=>{if(classificationTicket.suggested_course_id||metadata.folder_node_id||metadata.folder_path)setDestinationSource("ai");}} className={`mt-auto w-full rounded-lg py-2 text-xs font-semibold transition ${destinationSource==="ai"&&(classificationTicket.suggested_course_id||metadata.folder_node_id)?"bg-blue-500 text-white":"border border-gray-300 bg-white text-gray-700 hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-40"}`}>{destinationSource==="ai"?"✓ Đã chọn phương án này":"Chọn phương án này"}</button>
      </div>
      {/* Panel phải: Chọn thủ công */}
      <div className={`flex flex-col rounded-xl border-2 p-3 transition-all ${destinationSource==="manual"?"border-blue-500 bg-blue-50":"border-gray-200 bg-gray-50"}`}>
        <strong className="mb-2 text-sm">✏️ Chọn thủ công</strong>
        <div className="my-2 flex-1 space-y-2">
          {folderOptions.length>0&&<FolderNodePicker options={folderOptions} value={metadata.folder_node_id} onChange={node=>{selectManualFolder(node);setDestinationSource("manual");}}/>}
          <FolderPicker tree={virtualFolderTree} value={metadata.folder_path} onChange={path=>{selectFolderPath(path);if(path)setDestinationSource("manual");}}/>
          <input className="field w-full text-xs" placeholder="Hoặc nhập đường dẫn thủ công..." value={metadata.folder_path} onChange={e=>{selectFolderPath(e.target.value);if(e.target.value)setDestinationSource("manual");}}/>
          {destinationSource==="manual"&&finalDestination.path&&(
            <div className="rounded-lg bg-white p-2 text-xs">
              <p className="text-xs text-gray-400 mb-1">Xem trước đường dẫn:</p>
              <p className="font-mono text-blue-700 break-all">{finalDestination.path}</p>
            </div>
          )}
          <div className="border-t pt-2">
            <p className="mb-1 text-xs font-semibold text-gray-500">📁 Yêu cầu tạo thư mục mới</p>
            {folderRequestSent?(
              <p className="rounded-lg bg-green-50 px-2 py-1 text-xs text-green-700">✓ Đã gửi yêu cầu tới admin duyệt.</p>
            ):(
              <div className="space-y-1">
                <input className="field w-full text-xs" placeholder="Tên thư mục mới (VD: Computer Vision)" value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}/>
                <input className="field w-full text-xs" placeholder="Thuộc thư mục cha (tuỳ chọn)" value={newFolderParent} onChange={e=>setNewFolderParent(e.target.value)}/>
                <button type="button" onClick={submitFolderRequest} disabled={!newFolderName.trim()||folderRequestBusy} className="w-full rounded-lg border border-blue-300 bg-blue-50 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40">{folderRequestBusy?"Đang gửi...":"Gửi yêu cầu tới admin"}</button>
              </div>
            )}
          </div>
        </div>
        <button type="button" disabled={destinationSource!=="manual"&&!metadata.folder_node_id&&!metadata.folder_path&&!metadata.course_id} onClick={()=>setDestinationSource("manual")} className={`mt-auto w-full rounded-lg py-2 text-xs font-semibold transition ${destinationSource==="manual"?"bg-blue-500 text-white":"border border-gray-300 bg-white text-gray-700 hover:border-blue-400"}`}>{destinationSource==="manual"?"✓ Đã chọn phương án này":"Chọn phương án này"}</button>
      </div>
    </div>
    {finalDestination.path&&<p className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs font-medium text-green-800">📂 Sẽ lưu vào: <span className="font-mono">{finalDestination.path}</span> · <span className="text-green-600">{metadata.visibility==="public"?"Công khai":"Riêng tư"}</span></p>}
  </div>
)}{launchedTask?.status!=="pending_confirmation"&&<DestinationAssistant messages={destinationChatMessages} input={destinationChatInput} busy={destinationChatBusy} onInput={setDestinationChatInput} onSend={sendDestinationChat}/>}{successMsg&&<p className="mt-3 rounded bg-green-100 border border-green-400 p-3 text-sm font-semibold text-green-800 flex items-center gap-2">✅ {successMsg}</p>}{message&&<p className="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800">{message}</p>}<p className="muted mt-3 text-xs">Bạn có thể đóng cửa sổ hoặc chuyển trang sau khi bắt đầu. Theo dõi tiến trình tại bảng Upload gần đây.</p><div className="mt-5 flex justify-end gap-2">{launchedTask&&!["processing","completed"].includes(launchedTask.status)&&<button className="btn-secondary text-red-600" disabled={startingUpload} onClick={cancelLaunchedUpload}>Hủy upload</button>}<button className="btn-secondary" onClick={()=>setUploadOpen(false)}>Đóng</button><button disabled={!file||file.size>MAX_UPLOAD_BYTES||!metadata.title||(!metadata.topic&&!classificationTicket)||startingUpload||launchedActive||autoAnalyzing} className="btn-primary" onClick={classificationTicket&&launchedTask?.status==="pending_confirmation"?confirmUpload:uploadFile}>{(startingUpload||launchedActive)&&<LoaderCircle className="animate-spin" size={15}/>}{autoAnalyzing&&<LoaderCircle className="animate-spin" size={15}/>} {autoAnalyzing?"AI đang phân tích...":classificationTicket&&launchedTask?.status==="pending_confirmation"?"Xác nhận lưu":launchedActive?"Đang xử lý...":updateCandidate&&!uploadAsNew?`Cập nhật lên v${updateCandidate.current_version+1}`:"Bắt đầu tải lên"}</button></div></Modal>}
  </div>;
}

function FolderNavigation({tree,selectedPath,selectedFileId,onSelectFolder,onOpenFile,collapsed=false}:{tree:FolderTree;selectedPath:string;selectedFileId:string;onSelectFolder:(path:string)=>void;onOpenFile:(id:string)=>void;collapsed?:boolean}){
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set([""]));
  const [folderQuery,setFolderQuery]=useState("");
  const [focusIndex,setFocusIndex]=useState(0);
  const treeRef=useRef<HTMLDivElement>(null);
  const normalizedQuery=folderQuery.trim().toLocaleLowerCase("vi");

  const rows=useMemo(()=>{
    const result:TreeRow[]=[{type:"folder",id:"root",name:"Tất cả tài liệu",path:"",parentPath:"",depth:0,hasChildren:Object.keys(tree).some(name=>name!=="_documents")}];

    function matchesFolder(node:FolderTree,name:string):boolean{
      if(!normalizedQuery||name.toLocaleLowerCase("vi").includes(normalizedQuery))return true;
      return Object.entries(node).some(([childName,child])=>childName!=="_documents"&&!Array.isArray(child)&&matchesFolder(child,childName));
    }

    function walk(node:FolderTree,parentPath:string,depth:number){
      Object.entries(node).filter(([name,value])=>name!=="_documents"&&!Array.isArray(value)&&matchesFolder(value as FolderTree,name)).sort(([a],[b])=>a.localeCompare(b,"vi")).forEach(([name,value])=>{
        const child=value as FolderTree;
        const path=parentPath?`${parentPath}/${name}`:name;
        const childFolders=Object.entries(child).filter(([childName,childValue])=>childName!=="_documents"&&!Array.isArray(childValue));
        const files=Array.isArray(child._documents)?child._documents:[];
        result.push({type:"folder",id:`folder:${path}`,name,path,parentPath,depth,hasChildren:childFolders.length>0||files.length>0});
        if(expanded.has(path)||normalizedQuery){
          walk(child,path,depth+1);
          files.forEach(file=>result.push({type:"file",id:file.id,name:file.title,path,depth:depth+1}));
        }
      });
    }

    if(expanded.has("")||normalizedQuery)walk(tree,"",1);
    return result;
  },[tree,expanded,normalizedQuery]);

  useEffect(()=>{
    setFocusIndex(index=>Math.min(index,Math.max(0,rows.length-1)));
  },[rows.length]);

  function focusRow(index:number){
    const next=Math.max(0,Math.min(rows.length-1,index));
    setFocusIndex(next);
    requestAnimationFrame(()=>treeRef.current?.querySelector<HTMLElement>(`[data-tree-index="${next}"]`)?.focus());
  }

  function toggleFolder(path:string){
    setExpanded(current=>{
      const next=new Set(current);
      if(next.has(path))next.delete(path);else next.add(path);
      return next;
    });
    onSelectFolder(path);
  }

  function activate(row:TreeRow){
    if(row.type==="folder")toggleFolder(row.path);else onOpenFile(row.id);
  }

  function onTreeKeyDown(event:React.KeyboardEvent,row:TreeRow,index:number){
    if(event.key==="ArrowDown"){event.preventDefault();focusRow(index+1);}
    else if(event.key==="ArrowUp"){event.preventDefault();focusRow(index-1);}
    else if(event.key==="Home"){event.preventDefault();focusRow(0);}
    else if(event.key==="End"){event.preventDefault();focusRow(rows.length-1);}
    else if(event.key==="Enter"||event.key===" "){event.preventDefault();activate(row);}
    else if(event.key==="ArrowRight"&&row.type==="folder"){
      event.preventDefault();
      if(!expanded.has(row.path))toggleFolder(row.path);else focusRow(index+1);
    }else if(event.key==="ArrowLeft"&&row.type==="folder"){
      event.preventDefault();
      if(expanded.has(row.path))toggleFolder(row.path);
      else focusRow(Math.max(0,rows.findIndex(candidate=>candidate.type==="folder"&&candidate.path===row.parentPath)));
    }
  }

  return <div className={collapsed?"p-2":"p-2"}>
    {!collapsed&&<div className="relative mb-2"><Search className="muted absolute left-3 top-2.5" size={14}/><input className="field" style={{ paddingLeft: '36px' }} value={folderQuery} onChange={event=>setFolderQuery(event.target.value)} placeholder="Tìm thư mục..."/></div>}
    <div ref={treeRef} role="tree" aria-label="Cây thư mục" className={`${collapsed?"max-h-[calc(100vh-160px)] overflow-y-auto overflow-x-hidden":"max-h-[65vh] overflow-auto"} text-sm`}>
      {rows.map((row,index)=>{
        const isFolder=row.type==="folder";
        const isExpanded=isFolder&&(expanded.has(row.path)||!!normalizedQuery);
        const isSelected=isFolder?selectedPath===row.path:selectedFileId===row.id;
        return <button key={`${row.type}:${row.id}`} title={collapsed?row.name:undefined} type="button" role="treeitem" aria-expanded={isFolder?isExpanded:undefined} aria-selected={isSelected} data-tree-index={index} tabIndex={focusIndex===index?0:-1} onFocus={()=>setFocusIndex(index)} onKeyDown={event=>onTreeKeyDown(event,row,index)} onClick={()=>activate(row)} onDoubleClick={()=>row.type==="file"&&onOpenFile(row.id)} className={`flex w-full items-center rounded-md py-1.5 text-left outline-none transition hover:bg-[var(--soft)] focus:ring-2 focus:ring-blue-400 ${collapsed?"justify-center px-0":"gap-1 pr-2"} ${isSelected?"bg-blue-50 font-bold text-blue-700":""}`} style={collapsed?undefined:{paddingLeft:`${6+row.depth*16}px`}}>
          {!collapsed&&(isFolder?(isExpanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>):<span className="w-[14px]"/>)}
          {isFolder?(isExpanded?<FolderOpen className="shrink-0 text-amber-500" size={15}/>:<Folder className="shrink-0 text-amber-500" size={15}/>):<File className="shrink-0 text-slate-500" size={14}/>}
          {!collapsed&&<span className="truncate">{row.name}</span>}
        </button>;
      })}
      {!rows.length&&<p className="muted p-3 text-xs">Không tìm thấy thư mục.</p>}
    </div>
    {!collapsed&&<p className="muted mt-2 border-t border-[var(--border)] px-2 pt-2 text-xs">Dùng phím mũi tên để điều hướng, Enter để mở.</p>}
  </div>;
}

function Modal({children,onClose}:{children:React.ReactNode;onClose:()=>void}){
  const parts=Children.toArray(children);
  const header=parts.slice(0,2);
  const footer=parts.slice(-1);
  const body=parts.slice(2,-1);
  useEffect(()=>{
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=previous;};
  },[]);
  return <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-slate-950/60 p-3 sm:p-4" onClick={onClose}>
    <div className="app-card flex max-h-[90vh] w-[95vw] flex-col overflow-hidden md:w-[80vw] xl:w-[1000px] 2xl:w-[1100px]" onClick={e=>e.stopPropagation()}>
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-4">{header}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{body}</div>
      <div className="sticky bottom-0 z-10 shrink-0 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">{footer}</div>
    </div>
  </div>;
}

function folderTreeFromNodes(nodes:FolderNode[],documents:Document[]):FolderTree{
  const root:FolderTree={};
  const byNodeId=new Map<string,{id:string;title:string}[]>();
  documents.forEach(document=>{
    if(document.folder_node_id)byNodeId.set(document.folder_node_id,[...(byNodeId.get(document.folder_node_id)||[]),{id:document.id,title:document.title}]);
  });
  function add(node:FolderNode,target:FolderTree){
    const child:FolderTree={};
    const files=byNodeId.get(node.id)||[];
    if(files.length)child._documents=files;
    node.children.forEach(item=>add(item,child));
    target[node.name]=child;
  }
  nodes.forEach(node=>add(node,root));
  return root;
}

function flattenFolderNodes(nodes:FolderNode[],depth=0):Array<FolderNode&{depth:number}>{
  return nodes.flatMap(node=>[
    {...node,depth},
    ...flattenFolderNodes(node.children,depth+1),
  ]).filter(node=>!["department","faculty","specialization"].includes(node.type));
}

function FolderNodePicker({options,value,onChange}:{options:Array<FolderNode&{depth:number}>;value:string;onChange:(option:(FolderNode&{depth:number})|undefined)=>void}){
  return <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
    <strong className="block text-xs text-blue-900">Chọn nhánh trong cây tri thức chuẩn</strong>
    <p className="muted mt-1 text-xs">Giảng viên chỉ thấy và tải lên vào các nhánh thuộc nhóm chuyên môn đã chọn.</p>
    <select className="field mt-3" value={value} onChange={event=>onChange(options.find(item=>item.id===event.target.value))}>
      <option value="">Chọn nhánh được phép tải lên</option>
      {options.map(option=><option key={option.id} value={option.id}>{"--".repeat(option.depth)} {option.path}</option>)}
    </select>
  </div>;
}

function FolderPicker({tree,value,onChange}:{tree:FolderTree;value:string;onChange:(path:string)=>void}){
  const selected=value.split("/").filter(Boolean);
  const levels:{options:string[];selected:string}[]=[];
  let node=tree;

  for(let depth=0;depth<=selected.length;depth++){
    const options=Object.keys(node).filter(name=>name!=="_documents").sort((a,b)=>a.localeCompare(b,"vi"));
    if(!options.length)break;
    levels.push({options,selected:selected[depth]||""});
    const next=selected[depth]?node[selected[depth]]:undefined;
    if(!next||Array.isArray(next))break;
    node=next;
  }

  return <div className="sm:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--soft)] p-3">
    <div className="flex items-center justify-between gap-3">
      <div><strong className="block text-xs">Chọn thư mục có sẵn</strong><span className="muted text-xs">Chọn thư mục cha để hiện các thư mục con.</span></div>
      {value&&<button type="button" className="text-xs font-bold text-blue-600" onClick={()=>onChange("")}>Bỏ chọn</button>}
    </div>
    {levels.length?<div className="mt-3 grid gap-2 sm:grid-cols-2">{levels.map((level,depth)=><select key={depth} className="field" value={level.selected} onChange={e=>onChange([...selected.slice(0,depth),e.target.value].filter(Boolean).join("/"))}><option value="">Chọn thư mục cấp {depth+1}</option>{level.options.map(name=><option key={name} value={name}>{name}</option>)}</select>)}</div>:<p className="muted mt-3 text-xs">Chưa có thư mục cũ để lựa chọn.</p>}
    {value&&<p className="mt-2 break-all text-xs"><span className="muted">Đường dẫn đã chọn: </span><strong>{value}</strong></p>}
  </div>;
}

function DocumentFields({form,setForm}:{form:DocumentForm;setForm:React.Dispatch<React.SetStateAction<DocumentForm>>}){
  return <div className="mt-5 grid gap-3 sm:grid-cols-2"><input className="field" placeholder="Tên tài liệu" value={form.title} onChange={e=>setForm(x=>({...x,title:e.target.value}))}/><input className="field" placeholder="Chủ đề" value={form.topic} onChange={e=>setForm(x=>({...x,topic:e.target.value}))}/><select className="field" value={form.doc_type} onChange={e=>setForm(x=>({...x,doc_type:e.target.value}))}>{DOCUMENT_TYPES.map(type=><option key={type} value={type}>{type}</option>)}</select><select className="field" value={form.visibility} onChange={e=>setForm(x=>({...x,visibility:e.target.value as DocumentForm["visibility"]}))}><option value="public">Công khai</option><option value="private">Riêng tư</option></select><input className="field sm:col-span-2" placeholder="Thư mục lưu (không bắt buộc)" value={form.folder_path} onChange={e=>setForm(x=>({...x,folder_path:e.target.value}))}/><textarea className="field min-h-48 sm:col-span-2" placeholder="Nội dung tài liệu" value={form.content} onChange={e=>setForm(x=>({...x,content:e.target.value}))}/></div>;
}

function DestinationAssistant({messages,input,busy,onInput,onSend}:{messages:DestinationChatMessage[];input:string;busy:boolean;onInput:(value:string)=>void;onSend:()=>void}){
  return <div className="mt-4 rounded-xl border border-blue-200 bg-white">
    <div className="flex items-start gap-2 border-b border-[var(--border)] p-3">
      <Bot size={17} className="mt-0.5 shrink-0 text-blue-600"/>
      <div>
        <strong className="block text-sm">Trợ lý chọn nơi lưu</strong>
        <p className="muted mt-1 text-xs">Chỉ chọn học phần/folder trong nhánh được phép. Yêu cầu tạo ngành/học phần mới sẽ gửi admin duyệt.</p>
      </div>
    </div>
    <div className="max-h-56 space-y-2 overflow-auto p-3 text-xs">
      {messages.map((message,index)=><div key={index} className={`rounded-lg p-2 ${message.role==="assistant"?"bg-blue-50 text-blue-950":"ml-8 bg-[var(--soft)] text-[var(--text)]"}`}>
        <strong className="mb-1 block">{message.role==="assistant"?"Trợ lý":"Bạn"}</strong>
        {message.content}
      </div>)}
    </div>
    <div className="border-t border-[var(--border)] p-3">
      <div className="flex gap-2">
        <textarea className="field min-h-16 flex-1 text-xs" value={input} onChange={event=>onInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();if(input.trim()&&!busy)onSend();}}} placeholder="Ví dụ: lưu vào NLP / Bài giảng, hoặc yêu cầu admin thêm học phần mới..."/>
        <button className="icon-btn h-10 w-10 shrink-0" disabled={busy||!input.trim()} onClick={onSend} title="Gửi yêu cầu"><Send size={15}/></button>
      </div>
      <p className="muted mt-2 text-xs">{busy?"Đang gửi yêu cầu...":"Enter để gửi, Shift + Enter để xuống dòng"}</p>
    </div>
  </div>;
}

function SaveLocationPreview({path,source,badge,title,topic,docType,visibility,onEditPath}:{
  path:string;source:string;badge:string;title:string;topic:string;docType:string;visibility:string;
  onEditPath:(p:string)=>void;
}){
  const [editingSegment,setEditingSegment]=useState<number|null>(null);
  const [segmentDraft,setSegmentDraft]=useState("");
  const segments=path.split("/").filter(Boolean);

  function startEdit(i:number){setEditingSegment(i);setSegmentDraft(segments[i]||"");}

  function commitEdit(i:number){
    const next=[...segments];
    const val=segmentDraft.trim();
    if(val)next[i]=val;else next.splice(i,1);
    onEditPath(next.join("/"));
    setEditingSegment(null);
  }

  function handleKey(e:React.KeyboardEvent,i:number){
    if(e.key==="Enter"){e.preventDefault();commitEdit(i);}
    else if(e.key==="Escape"){setEditingSegment(null);}
  }

  return <div className="mt-3 rounded-lg border border-blue-200 bg-white p-3">
    <div className="flex items-center justify-between gap-2 mb-3">
      <strong className="text-sm">Nơi lưu & Chỉ mục RAG</strong>
      <span className={`badge ${source==="manual"?"badge-green":"badge-amber"}`}>{badge}</span>
    </div>
    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 font-mono text-xs space-y-1">
      <div className="flex items-center gap-1.5 text-slate-500"><FolderOpen size={13} className="text-amber-400 shrink-0"/><span>Kho tri thức</span></div>
      {path?segments.map((seg,i)=>(
        <div key={i} className="flex items-center gap-1" style={{paddingLeft:`${(i+1)*14}px`}}>
          <span className="text-slate-300 select-none">└─</span>
          {editingSegment===i
            ?<input autoFocus className="field py-0.5 px-1.5 text-xs h-auto w-40 font-sans" value={segmentDraft}
                onChange={e=>setSegmentDraft(e.target.value)} onBlur={()=>commitEdit(i)} onKeyDown={e=>handleKey(e,i)}/>
            :<><Folder size={12} className="text-amber-400 shrink-0"/>
              <span className="text-slate-700 font-semibold truncate max-w-[200px]" title={seg}>{seg}</span>
              <button type="button" className="ml-1 text-blue-400 hover:text-blue-600" onClick={()=>startEdit(i)} title="Sửa tên thư mục"><Pencil size={10}/></button></>}
        </div>
      )):<div className="flex items-center gap-1.5 pl-3.5 text-slate-400 italic"><span className="text-slate-200 select-none">└─</span><span>Chưa chọn thư mục</span></div>}
      {title&&<div className="flex items-center gap-1.5" style={{paddingLeft:`${(segments.length+1)*14}px`}}>
        <span className="text-slate-300 select-none">└─</span>
        <File size={12} className="text-blue-400 shrink-0"/>
        <span className="font-semibold text-blue-700 truncate max-w-[220px]" title={title}>{title}</span>
        <span className={`ml-1 badge text-xs ${visibility==="public"?"badge-green":"badge-amber"}`}>{visibility==="public"?"Công khai":"Riêng tư"}</span>
      </div>}
    </div>
    {path&&<p className="mt-1.5 text-xs text-slate-400 flex items-center gap-1"><Pencil size={9}/>Nhấp vào tên thư mục để đổi tên trước khi lưu</p>}
    <div className="mt-3 border-t border-slate-100 pt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      <span className="text-slate-400">Tiêu đề</span><strong className="truncate">{title||"—"}</strong>
      <span className="text-slate-400">Chủ đề</span><span className="truncate">{topic||"—"}</span>
      <span className="text-slate-400">Loại tài liệu</span><span>{docType||"—"}</span>
      <span className="text-slate-400">Đường dẫn</span><span className="break-all text-blue-700 font-semibold">{path||"Chưa chọn"}</span>
    </div>
  </div>;
}
