"use client"

import { useEffect, useState } from "react"

type Lead = {
  id: number
  name: string
  email: string
  website: string
  source: string
  segment: string
  total_score: number
  created_at: string
}

export default function AgentLeadsPage(){

  const [leads,setLeads] = useState<Lead[]>([])
  const [source,setSource] = useState("")
  const [segment,setSegment] = useState("")

  async function loadLeads(){

    const params = new URLSearchParams()

    if(source) params.append("source",source)
    if(segment) params.append("segment",segment)

    const res = await fetch("/api/agent/leads?"+params.toString())

    const data = await res.json()

    setLeads(data)

  }

  useEffect(()=>{
    loadLeads()
  },[])

  useEffect(()=>{
    loadLeads()
  },[source,segment])

  return(

    <div className="p-10 max-w-7xl mx-auto">

      <h1 className="text-2xl font-bold mb-6">
        Agent Leads
      </h1>

      <div className="flex gap-4 mb-6">

        <select
          className="border p-2 rounded"
          value={source}
          onChange={e=>setSource(e.target.value)}
        >
          <option value="">All Sources</option>
          <option value="google">Google</option>
          <option value="linkedin">LinkedIn</option>
          <option value="instagram">Instagram</option>
        </select>

        <select
          className="border p-2 rounded"
          value={segment}
          onChange={e=>setSegment(e.target.value)}
        >
          <option value="">All Segments</option>
          <option value="cold">Cold</option>
          <option value="warm">Warm</option>
          <option value="hot">Hot</option>
        </select>

      </div>

      <table className="w-full border">

        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 border">Name</th>
            <th className="p-3 border">Email</th>
            <th className="p-3 border">Website</th>
            <th className="p-3 border">Source</th>
            <th className="p-3 border">Score</th>
            <th className="p-3 border">Segment</th>
          </tr>
        </thead>

        <tbody>

          {leads.map(lead=>(
            <tr key={lead.id}>
              <td className="p-3 border">{lead.name}</td>
              <td className="p-3 border">{lead.email}</td>
              <td className="p-3 border">{lead.website}</td>
              <td className="p-3 border">{lead.source}</td>
              <td className="p-3 border">{lead.total_score}</td>
              <td className="p-3 border">{lead.segment}</td>
            </tr>
          ))}

        </tbody>

      </table>

    </div>

  )
}