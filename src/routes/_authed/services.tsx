import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Trash } from 'lucide-react'

export const Route = createFileRoute('/_authed/services')({
  component: RouteComponent,
})

function RouteComponent() {
  const DATA = [
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Weekly Lawn Mowing',
      description:
        'Weekly lawn mowing, trimming, and cleanup of grass clippings for residential properties.',
      service_type: 'recurring',
      base_price: 55.0,
      estimated_duration_minutes: 60,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Bi-Weekly Lawn Maintenance',
      description:
        'Lawn mowing, edging, and general yard maintenance performed every two weeks.',
      service_type: 'recurring',
      base_price: 75.0,
      estimated_duration_minutes: 90,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Garden Bed Maintenance',
      description:
        'Regular weeding, soil cultivation, deadheading, and general garden bed upkeep.',
      service_type: 'recurring',
      base_price: 85.0,
      estimated_duration_minutes: 90,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Commercial Grounds Maintenance',
      description:
        'Routine lawn care, edging, litter removal, and landscape maintenance for commercial properties.',
      service_type: 'recurring',
      base_price: 250.0,
      estimated_duration_minutes: 180,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Snow Removal',
      description:
        'Scheduled driveway and walkway snow clearing during the winter season.',
      service_type: 'recurring',
      base_price: 65.0,
      estimated_duration_minutes: 45,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Property Maintenance',
      description:
        'Ongoing exterior property upkeep including lawn care, garden maintenance, and debris removal.',
      service_type: 'recurring',
      base_price: 150.0,
      estimated_duration_minutes: 120,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Spring Yard Cleanup',
      description:
        'Comprehensive spring cleanup including debris removal, leaf collection, and garden bed preparation.',
      service_type: 'one_time',
      base_price: 225.0,
      estimated_duration_minutes: 180,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Fall Leaf Cleanup',
      description:
        'Removal and disposal of fallen leaves and seasonal debris from lawns and garden beds.',
      service_type: 'one_time',
      base_price: 175.0,
      estimated_duration_minutes: 150,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Lawn Aeration',
      description:
        'Core aeration to improve soil oxygen, water absorption, and overall lawn health.',
      service_type: 'one_time',
      base_price: 120.0,
      estimated_duration_minutes: 60,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Power Raking',
      description:
        'Mechanical removal of excess thatch and dead grass to encourage healthy lawn growth.',
      service_type: 'one_time',
      base_price: 150.0,
      estimated_duration_minutes: 90,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Sod Installation',
      description:
        'Removal of existing turf, soil preparation, and installation of fresh sod.',
      service_type: 'one_time',
      base_price: 1200.0,
      estimated_duration_minutes: 480,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Mulch Installation',
      description:
        'Supply and installation of decorative mulch in garden beds and landscaped areas.',
      service_type: 'one_time',
      base_price: 275.0,
      estimated_duration_minutes: 180,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Hedge and Shrub Trimming',
      description:
        'Pruning and shaping of hedges, shrubs, and ornamental bushes.',
      service_type: 'one_time',
      base_price: 135.0,
      estimated_duration_minutes: 120,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Tree Pruning',
      description:
        'Removal of small dead or overgrown branches to maintain tree health and appearance.',
      service_type: 'one_time',
      base_price: 300.0,
      estimated_duration_minutes: 180,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Garden Bed Installation',
      description:
        'Preparation and installation of new garden beds including edging, soil, and planting.',
      service_type: 'one_time',
      base_price: 650.0,
      estimated_duration_minutes: 360,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Pressure Washing',
      description:
        'Pressure washing of driveways, patios, walkways, and other exterior hard surfaces.',
      service_type: 'one_time',
      base_price: 225.0,
      estimated_duration_minutes: 150,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Irrigation System Winterization',
      description:
        'Seasonal draining and winterization of residential irrigation systems.',
      service_type: 'one_time',
      base_price: 125.0,
      estimated_duration_minutes: 60,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Landscape Consultation',
      description:
        'On-site consultation to assess landscaping needs, discuss project options, and prepare recommendations.',
      service_type: 'one_time',
      base_price: 0.0,
      estimated_duration_minutes: 60,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Retaining Wall Installation',
      description:
        'Design and construction of residential retaining walls using landscape blocks or natural stone.',
      service_type: 'one_time',
      base_price: null,
      estimated_duration_minutes: 960,
      is_active: true,
    },
    {
      organization_id: 'YOUR_ORGANIZATION_UUID',
      name: 'Seasonal Flower Planting',
      description:
        'Installation of seasonal flowers and ornamental plants in existing garden beds.',
      service_type: 'one_time',
      base_price: 180.0,
      estimated_duration_minutes: 120,
      is_active: false,
    },
  ]

  const SERVICE_TYPE = [
    {
      value: 'one_time',
      label: 'One Time',
    },
    {
      value: 'recurring',
      label: 'Recurring',
    },
  ]

  return (
    <div className="pt-16 px-8 overflow-scroll">
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-2xl font-bold">Services</h1>
          <p>Manage the services offered by your organization</p>
        </div>
        <button className="bg-blue-600 hover:cursor-pointer hover:bg-blue-700 text-white px-4 py-2 rounded">
          Add Service
        </button>
      </div>

      <table className="min-w-full border-collapse border border-gray-200">
        <thead className="bg-green-800">
          <tr className="text-left text-white">
            <th className="px-4 py-2 border border-gray-200">Name</th>
            <th className="px-4 py-2 border border-gray-200">Description</th>
            <th className="px-4 py-2 border border-gray-200">Service Type</th>
            <th className="px-4 py-2 border border-gray-200">Base Price</th>
            <th className="px-4 py-2 border border-gray-200">
              Estimated Duration (minutes)
            </th>
            <th className="px-4 py-2 border border-gray-200">Active</th>
            <th className="px-4 py-2 border border-gray-200">Actions</th>
          </tr>
        </thead>
        <tbody>
          {DATA.map((service, index) => (
            <tr
              className={`text-left hover:cursor-pointer hover:bg-gray-200 duration-200 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-100'}`}
              key={service.name}
            >
              <td className="font-bold px-2 py-2">{service.name}</td>
              <td className="px-2 py-2">{service.description}</td>
              <td className="px-2 py-2">
                {SERVICE_TYPE.find(
                  (type) => type.value === service.service_type,
                )?.label || 'N/A'}
              </td>
              <td className="px-2 py-2">
                {service.base_price != null
                  ? `$${service.base_price.toFixed(2)}`
                  : 'N/A'}
              </td>
              <td className="px-2 py-2">
                {service.estimated_duration_minutes}
              </td>
              <td className="px-2 py-2">{service.is_active ? 'Yes' : 'No'}</td>
              <td className="px-2 py-2">
                <button className="text-gray-500 px-2 py-2 py-1 rounded mr-2 hover:cursor-pointer hover:text-gray-700 duration-200">
                  <Pencil size={16} />
                </button>
                <button className="text-red-500 px-2 py-2 py-1 rounded hover:cursor-pointer hover:text-red-700 duration-200">
                  <Trash size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
