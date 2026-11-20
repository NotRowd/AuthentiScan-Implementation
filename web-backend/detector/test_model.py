import unittest
from io import BytesIO
from PIL import Image
import torch
from model import decode_image, serialize_prediction, MAX_BYTES


class DetectorTests(unittest.TestCase):
    def test_decode_and_raw_exif_orientation(self):
        output = BytesIO()
        image = Image.new('RGB', (40, 20), 'blue')
        exif = Image.Exif(); exif[274] = 6
        image.save(output, format='JPEG', exif=exif)
        self.assertEqual(decode_image(output.getvalue()).size, (40, 20))

    def test_rejects_bad_animated_and_large_input(self):
        for data in [b'', b'not an image', b'x' * (MAX_BYTES + 1)]:
            with self.assertRaises(Exception): decode_image(data)
        output = BytesIO()
        Image.new('RGB', (5, 5), 'red').save(output, format='GIF')
        with self.assertRaises(ValueError): decode_image(output.getvalue())

    def test_boxes_threshold_clamping_and_no_objects(self):
        prediction = {'scores': torch.tensor([.9,.2,.8]), 'labels': torch.tensor([1,18,18]),
                      'boxes': torch.tensor([[-5,0,60,20],[0,0,30,20],[30,0,20,20]])}
        result = serialize_prediction(prediction, 40, 20)
        self.assertEqual(len(result['objects']), 1)
        self.assertEqual(result['objects'][0]['box'], [0,0,1,1])
        self.assertEqual(result['objects'][0]['label'], 'person')
        empty = serialize_prediction({'scores':torch.tensor([]),'labels':torch.tensor([]),'boxes':torch.empty((0,4))},40,20)
        self.assertEqual(empty['objects'], [])


if __name__ == '__main__': unittest.main()
