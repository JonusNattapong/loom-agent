import type {Message,Provider,ProviderRequest,ProviderResponse} from "@loom/core";
export class MockProvider implements Provider {
  readonly name="mock";
  async complete(messages:Message[]):Promise<{content:string}>{const task=messages.find(m=>m.role==="user")?.content??"";return {content:`Completed task: ${task}`};}
}
export class OpenAICompatibleProvider implements Provider {
 readonly name="openai";constructor(private readonly apiKey=process.env.OPENAI_API_KEY,private readonly model=process.env.LOOM_MODEL??"gpt-4o-mini",private readonly baseUrl=process.env.OPENAI_BASE_URL??"https://api.openai.com/v1"){if(!apiKey)throw new Error("OPENAI_API_KEY is required for the openai provider");}
 async complete(messages:Message[]){return this.generate({messages,model:this.model});}
 async generate(request:ProviderRequest):Promise<ProviderResponse>{const response=await fetch(`${this.baseUrl}/chat/completions`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${this.apiKey}`},body:JSON.stringify({model:request.model??this.model,messages:[...(request.system?[{role:"system",content:request.system}]:[]),...request.messages],tools:request.tools?.map(t=>({type:"function",function:{name:t.name,description:t.description,parameters:t.inputSchema??{type:"object"}}}))})});if(!response.ok)throw new Error(`provider request failed (${response.status})`);const data=await response.json() as any;const message=data.choices?.[0]?.message??{};return {content:message.content??"",toolCalls:(message.tool_calls??[]).map((c:any)=>({id:c.id,name:c.function.name,input:JSON.parse(c.function.arguments||"{}")})),usage:data.usage,finishReason:data.choices?.[0]?.finish_reason,requestId:data.id,metadata:{model:data.model}};}
}
