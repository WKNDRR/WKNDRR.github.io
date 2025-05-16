const images = [
    'images/wkndr1.jpg',
    'images/wkndr2.jpg',
    'images/wkndr3.jpg',
    'images/wkndr4.jpg',
    'images/wkndr5.jpg',
    'images/wkndr6.jpg',
    'images/wkndr7.jpg',
    'images/wkndr8.jpg',
    'images/wkndr9.jpg',
    'images/wkndr10.jpg',
  ];
  let idx = 0;
  const imgTag = document.getElementById('carousel-img');
  
  function showImage(newIdx) {
    imgTag.style.opacity = 0;
    setTimeout(() => {
      idx = (newIdx + images.length) % images.length;
      imgTag.src = images[idx];
      imgTag.style.opacity = 1;
    }, 700);
  }
  
  function nextImage() {
    showImage(idx + 1);
  }
  setInterval(nextImage, 4300);
  